import { readFile, writeFile, rename, stat } from 'fs/promises';
import { randomBytes } from 'crypto';
import config from '../config/env.js';
import { parseVerdict } from '../lib/igSchemas.js';

// OpenAI image backends for Instagram Studio — the same two stages Gemini covers
// (make the artwork, then a vision quality gate) through one of:
//   codex  — the Codex CLI/app's ChatGPT sign-in (the auth.json that `codex login`
//            writes). Calls the private endpoints the Codex client itself uses and
//            is billed to that subscription's Codex limits. OpenAI documents no
//            API contract for this, so it can change; the API-key route is the
//            supported one.
//   openai — a regular OPENAI_API_KEY against the public Images + Responses APIs.
// Both return raw PNG bytes; the caller converts them to Instagram's JPEG.

const CODEX_BASE = 'https://chatgpt.com/backend-api/codex';
const CODEX_TOKEN_URL = 'https://auth.openai.com/oauth/token';
const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'; // Codex CLI's public OAuth client id
const CODEX_UA = 'codex_cli_rs/0.140.0 (article-writer)';
const IMAGE_TIMEOUT = 180_000;
const VISION_TIMEOUT = 90_000;
const RATE_LIMIT_WAIT = 20_000; // one retry after a per-minute limit; a spent quota is not retried
const SQUARE = '1024x1024';

const userError = (message) => Object.assign(new Error(message), { status: 400 });
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

// ─── Codex (ChatGPT sign-in) credentials ────────────────────────────────────

const jwtClaims = (jwt) => {
  try { return JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString('utf8')); } catch { return {}; }
};
const authClaims = (jwt) => jwtClaims(jwt)['https://api.openai.com/auth'] || {};
const tokenExpiry = (auth) => (jwtClaims(auth.tokens.access_token).exp || 0) * 1000;

async function readAuth() {
  let raw;
  try { raw = await readFile(config.images.codex.authFile, 'utf8'); } catch {
    throw userError(`Codex sign-in not found at ${config.images.codex.authFile} — run "codex login" on this server (or set CODEX_AUTH_FILE).`);
  }
  let auth;
  try { auth = JSON.parse(raw); } catch { throw userError('Codex auth.json is not valid JSON — run "codex login" again.'); }
  if (!auth?.tokens?.access_token) throw userError('Codex auth.json holds no ChatGPT tokens — sign in with "codex login" using a ChatGPT account (not an API key).');
  return auth;
}

// Exchange the refresh token and rewrite auth.json atomically, the way the Codex
// client does, so a crash mid-write can never corrupt the file it reads too.
async function refreshAuth(auth) {
  if (!auth.tokens.refresh_token) throw userError('Codex sign-in expired and has no refresh token — run "codex login" again.');
  const res = await fetch(CODEX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CODEX_CLIENT_ID, grant_type: 'refresh_token', refresh_token: auth.tokens.refresh_token }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw userError(`Codex sign-in could not be refreshed (HTTP ${res.status}) — run "codex login" again on the server.`);
  const fresh = await res.json();
  const next = {
    ...auth,
    tokens: {
      ...auth.tokens,
      access_token: fresh.access_token || auth.tokens.access_token,
      refresh_token: fresh.refresh_token || auth.tokens.refresh_token,
      id_token: fresh.id_token || auth.tokens.id_token,
      last_refresh: new Date().toISOString(),
    },
  };
  const tmp = `${config.images.codex.authFile}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(tmp, JSON.stringify(next, null, 2), { mode: 0o600 });
  await rename(tmp, config.images.codex.authFile);
  return next;
}

let refreshing = null; // one refresh at a time (PM2 runs a single fork)

// A usable access token + account id, refreshed when it's about to expire.
async function codexCredentials({ force = false } = {}) {
  let auth = await readAuth();
  if (force || tokenExpiry(auth) - Date.now() < 60_000) {
    refreshing ||= refreshAuth(auth).finally(() => { refreshing = null; });
    auth = await refreshing;
  }
  const { tokens } = auth;
  const claims = { ...authClaims(tokens.access_token), ...authClaims(tokens.id_token) };
  return {
    token: tokens.access_token,
    accountId: tokens.account_id || claims.chatgpt_account_id || null,
    plan: claims.chatgpt_plan_type || null,
    expiresAt: tokenExpiry(auth),
  };
}

const codexHeaders = (creds, accept) => ({
  Authorization: `Bearer ${creds.token}`,
  'Content-Type': 'application/json',
  Accept: accept,
  originator: 'codex_cli_rs',
  'User-Agent': CODEX_UA,
  ...(creds.accountId ? { 'ChatGPT-Account-ID': creds.accountId } : {}),
});

// ─── HTTP helpers (errors never include a token or key) ─────────────────────

async function httpError(res, who) {
  let msg = '';
  try {
    const body = await res.json();
    msg = body?.error?.message || body?.detail || body?.message || '';
  } catch { /* non-JSON body */ }
  msg = String(msg).slice(0, 200);
  if (res.status === 401) return userError(who === 'Codex' ? 'Codex sign-in was rejected — run "codex login" again on the server.' : 'OpenAI rejected the API key — check OPENAI_API_KEY.');
  if (res.status === 403) return userError(`${who}: image generation isn't available on this account${msg ? ` — ${msg}` : ''}`);
  if (res.status === 429) return new Error(`${who}: rate limited or out of image quota${msg ? ` — ${msg}` : ''}`);
  return new Error(`${who} HTTP ${res.status}${msg ? `: ${msg}` : ''}`);
}

async function codexFetch(path, body, { accept = 'application/json', timeout = IMAGE_TIMEOUT } = {}) {
  let creds = await codexCredentials();
  let refreshed = false;
  let waited = false;
  for (;;) {
    const res = await fetch(`${CODEX_BASE}${path}`, {
      method: 'POST', headers: codexHeaders(creds, accept), body: JSON.stringify(body), signal: AbortSignal.timeout(timeout),
    });
    if (res.status === 401 && !refreshed) {
      refreshed = true;
      creds = await codexCredentials({ force: true });
      continue;
    }
    if (res.status === 429 && !waited && !/insufficient_quota|usage_limit/.test(await res.clone().text())) {
      waited = true;
      await sleep(RATE_LIMIT_WAIT);
      continue;
    }
    if (!res.ok) throw await httpError(res, 'Codex');
    return res;
  }
}

async function openaiFetch(path, { timeout = IMAGE_TIMEOUT, headers = {}, ...init } = {}) {
  const res = await fetch(`${config.images.openai.baseUrl}${path}`, {
    ...init, headers: { Authorization: `Bearer ${config.images.openai.apiKey}`, ...headers }, signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw await httpError(res, 'OpenAI');
  return res;
}

// ─── Stage 3: generate ──────────────────────────────────────────────────────

function pickPng(json, who) {
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error(`${who}: no image in the response`);
  return Buffer.from(b64, 'base64');
}

const dataUrl = (ref) => `data:${ref.mimeType};base64,${ref.data}`;

// `references` are optional style images [{ data: base64, mimeType }] → the edits endpoint.
async function codexGenerate(prompt, references = [], size = SQUARE) {
  const base = { model: config.images.codex.imageModel, prompt, size, quality: config.images.quality, background: 'opaque' };
  const res = references.length
    ? await codexFetch('/images/edits', { ...base, images: references.map((r) => ({ image_url: dataUrl(r) })) })
    : await codexFetch('/images/generations', base);
  return pickPng(await res.json(), 'Codex');
}

async function openaiGenerate(prompt, references = [], size = SQUARE) {
  const { imageModel } = config.images.openai;
  if (!references.length) {
    const res = await openaiFetch('/images/generations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: imageModel, prompt, size, quality: config.images.quality, n: 1 }),
    });
    return pickPng(await res.json(), 'OpenAI');
  }
  const form = new FormData();
  form.set('model', imageModel);
  form.set('prompt', prompt);
  form.set('size', size);
  form.set('quality', config.images.quality);
  for (const r of references) form.append('image[]', new Blob([Buffer.from(r.data, 'base64')], { type: r.mimeType }), 'reference.jpg');
  const res = await openaiFetch('/images/edits', { method: 'POST', body: form });
  return pickPng(await res.json(), 'OpenAI');
}

// ─── Stage 4: vision quality gate ───────────────────────────────────────────

const visionInput = (prompt, jpegs) => [{
  role: 'user',
  content: [
    { type: 'input_text', text: `${prompt}\n\nReply with the JSON object only.` },
    ...jpegs.map((jpeg) => ({ type: 'input_image', image_url: `data:image/jpeg;base64,${jpeg.toString('base64')}` })),
  ],
}];

const outputText = (response) =>
  (response?.output || []).filter((o) => o.type === 'message')
    .flatMap((o) => o.content || []).filter((c) => c.type === 'output_text').map((c) => c.text).join('\n')
  || response?.output_text || '';

// The model's reply → the verdict (tolerates code fences or prose around the JSON).
function verdictFromText(text, who) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`${who} vision returned no verdict`);
  return parseVerdict(JSON.parse(match[0]));
}

// The Codex backend only streams: collect the final message text from the SSE events.
async function readSseText(res) {
  const raw = await res.text();
  let delta = '';
  let full = '';
  for (const chunk of raw.split(/\r?\n\r?\n/)) {
    const data = chunk.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
    if (!data || data === '[DONE]') continue;
    let ev;
    try { ev = JSON.parse(data); } catch { continue; }
    if (ev.type === 'response.output_text.delta') delta += ev.delta || '';
    else if (ev.type === 'response.completed') full = outputText(ev.response) || full;
    else if (ev.type === 'response.failed' || ev.type === 'error') {
      throw new Error(`Codex vision: ${ev.response?.error?.message || ev.error?.message || ev.message || 'request failed'}`.slice(0, 300));
    }
  }
  return full || delta;
}

async function codexInspect(prompt, jpegs) {
  const res = await codexFetch('/responses', {
    model: config.images.codex.visionModel, stream: true, store: false, input: visionInput(prompt, jpegs),
  }, { accept: 'text/event-stream', timeout: VISION_TIMEOUT });
  return verdictFromText(await readSseText(res), 'Codex');
}

async function openaiInspect(prompt, jpegs) {
  const res = await openaiFetch('/responses', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: VISION_TIMEOUT,
    body: JSON.stringify({ model: config.images.openai.visionModel, store: false, input: visionInput(prompt, jpegs) }),
  });
  return verdictFromText(outputText(await res.json()), 'OpenAI');
}

// ─── Health checks (no image quota spent) ───────────────────────────────────

async function checkCodex() {
  try {
    const creds = await codexCredentials();
    const plan = creds.plan ? ` (${creds.plan})` : '';
    return { ok: true, detail: `ChatGPT sign-in${plan} · ${config.images.codex.imageModel} + ${config.images.codex.visionModel}` };
  } catch (err) { return { ok: false, detail: err.message }; }
}

async function checkOpenai() {
  if (!config.images.openai.apiKey) return { ok: false, detail: 'Set OPENAI_API_KEY (or sign in with "codex login")' };
  try {
    await openaiFetch(`/models/${config.images.openai.imageModel}`, { method: 'GET', timeout: 10_000 });
    return { ok: true, detail: `${config.images.openai.imageModel} + ${config.images.openai.visionModel} · API key` };
  } catch (err) { return { ok: false, detail: err.message }; }
}

export const codexConfigured = () => stat(config.images.codex.authFile).then(() => true, () => false);
export const openaiConfigured = () => Boolean(config.images.openai.apiKey);

export const codexBackend = { provider: 'codex', generate: codexGenerate, inspect: codexInspect, check: checkCodex };
export const openaiBackend = { provider: 'openai', generate: openaiGenerate, inspect: openaiInspect, check: checkOpenai };
