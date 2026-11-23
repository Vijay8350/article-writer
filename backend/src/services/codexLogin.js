import { randomBytes } from 'crypto';
import * as openai from './openaiImages.js';

// Signs the server's image engine (Codex, billed to a ChatGPT plan) in from the Admin
// console, the way `codex login --device-auth` does: OpenAI shows a one-time code, the
// admin approves it on OpenAI's own page with their ChatGPT account, and the server
// collects the tokens and writes auth.json. Passwords are only ever typed on OpenAI's
// page; tokens never leave this server. One process (PM2 single fork), so pending logins
// live in memory.

const ISSUER = 'https://auth.openai.com';
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'; // the Codex CLI's public OAuth client id
const VERIFY_URL = `${ISSUER}/codex/device`;
const LIFETIME = 15 * 60 * 1000; // OpenAI's codes expire after 15 minutes
const MIN_INTERVAL = 3;          // seconds between checks with OpenAI, whatever it says

const pending = new Map(); // login id → { deviceAuthId, userCode, interval, expiresAt, lastPoll }

const fail = (message, status = 502) => Object.assign(new Error(message), { status });

async function post(path, body, form = false) {
  return fetch(`${ISSUER}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' },
    body: form ? new URLSearchParams(body).toString() : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
}

// Starts a sign-in. → { id, userCode, verificationUrl, interval, expiresAt }
export async function startLogin() {
  for (const [id, p] of pending) if (p.expiresAt < Date.now()) pending.delete(id);
  const res = await post('/api/accounts/deviceauth/usercode', { client_id: CLIENT_ID });
  if (res.status === 404) throw fail('OpenAI has not enabled code sign-in for this client. Sign in on the server with "codex login --device-auth" instead.');
  if (!res.ok) throw fail(`OpenAI refused to start the sign-in (HTTP ${res.status}).`);
  const data = await res.json();
  const userCode = data.user_code || data.usercode;
  if (!data.device_auth_id || !userCode) throw fail('OpenAI returned no sign-in code.');
  const id = randomBytes(16).toString('hex');
  const interval = Math.max(MIN_INTERVAL, parseInt(String(data.interval ?? ''), 10) || 5);
  const login = { deviceAuthId: data.device_auth_id, userCode, interval, expiresAt: Date.now() + LIFETIME, lastPoll: 0 };
  pending.set(id, login);
  return { id, userCode, verificationUrl: VERIFY_URL, interval, expiresAt: new Date(login.expiresAt).toISOString() };
}

// One check of a sign-in in progress (the console calls this every few seconds).
// → { status: 'pending' | 'done' | 'expired', account? }
export async function checkLogin(id) {
  const login = pending.get(id);
  if (!login) return { status: 'expired' };
  if (login.expiresAt < Date.now()) { pending.delete(id); return { status: 'expired' }; }
  if (Date.now() - login.lastPoll < login.interval * 1000) return { status: 'pending' };
  login.lastPoll = Date.now();

  const res = await post('/api/accounts/deviceauth/token', { device_auth_id: login.deviceAuthId, user_code: login.userCode });
  if (res.status === 403 || res.status === 404) return { status: 'pending' }; // not approved yet
  if (!res.ok) { pending.delete(id); throw fail(`OpenAI stopped the sign-in (HTTP ${res.status}). Start again.`); }
  const code = await res.json();
  if (!code.authorization_code || !code.code_verifier) { pending.delete(id); throw fail('OpenAI returned an incomplete approval. Start again.'); }
  pending.delete(id); // a code is used once, whatever happens next

  const tokenRes = await post('/oauth/token', {
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    code: code.authorization_code,
    redirect_uri: `${ISSUER}/deviceauth/callback`,
    code_verifier: code.code_verifier,
  }, true);
  if (!tokenRes.ok) throw fail(`OpenAI would not hand over the sign-in (HTTP ${tokenRes.status}). Start again.`);
  const account = await openai.saveCodexTokens(await tokenRes.json());
  return { status: 'done', account };
}

export const isLoginId = (id) => /^[a-f0-9]{32}$/.test(String(id || ''));
