import axios from 'axios';
import sharp from 'sharp';
import { randomBytes } from 'crypto';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import config from '../config/env.js';
import * as aiKeys from '../repositories/aiKeys.js';
import { safeAxiosConfig } from '../lib/safeHttp.js';
import { buildVisionPrompt } from '../lib/igPrompts.js';
import { parseVerdict } from '../lib/igSchemas.js';

// Gemini image generation (the quote text baked into the artwork) + the Gemini
// vision quality gate + local storage for the finished JPEGs. Instagram fetches
// images itself, so they're served publicly at /api/media/ig/<random>.jpg —
// unguessable names, nothing else in that folder.

const __dirname = dirname(fileURLToPath(import.meta.url));
export const MEDIA_DIR = resolve(__dirname, '../../media/ig');
const FILE_RE = /^[a-f0-9]{32}\.jpg$/;

const geminiHttp = axios.create({ baseURL: config.gemini.baseUrl, timeout: 120000 });

// Google's error object (the Interactions API wraps it in an array).
const googleError = (err) => {
  const data = err.response?.data;
  return (Array.isArray(data) ? data[0] : data)?.error;
};
const errorReason = (err) => googleError(err)?.details?.find((d) => d.reason)?.reason;

// Google's error → a readable message (never includes the key).
function geminiError(err, what) {
  const e = googleError(err);
  const reason = errorReason(err);
  if (reason === 'API_KEY_SERVICE_BLOCKED') return new Error(`Gemini ${what}: this key isn't allowed to use the Gemini API — add "Generative Language API" to its API restrictions`);
  if (reason === 'API_KEY_INVALID') return new Error(`Gemini ${what}: the API key is not valid — add a working key in Settings`);
  if (err.code === 'ECONNABORTED') return new Error(`Gemini ${what}: timed out`);
  return new Error(`Gemini ${what}: ${e?.message || err.message}`.slice(0, 300));
}

// The workspace's own Gemini key, else the platform key.
export async function geminiKeyFor(workspaceId) {
  const { geminiKey } = await aiKeys.getKeys(workspaceId);
  const key = geminiKey || config.gemini.apiKey;
  if (!key) throw Object.assign(new Error('No Gemini API key — add one in Settings (it makes the images).'), { status: 400 });
  return key;
}

// First base64 image anywhere in a response, whichever API shape it uses
// ({type:'image', data, mime_type} or {inlineData:{data, mimeType}}).
function findImage(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return null;
  const inline = node.inlineData || node.inline_data;
  if (inline?.data) return { b64: inline.data, mimeType: inline.mimeType || inline.mime_type || 'image/png' };
  const mime = node.mime_type || node.mimeType;
  if (typeof node.data === 'string' && node.data.length > 100 && (node.type === 'image' || /^image\//.test(mime || ''))) {
    return { b64: node.data, mimeType: mime || 'image/png' };
  }
  for (const v of Array.isArray(node) ? node : Object.values(node)) {
    const hit = findImage(v, depth + 1);
    if (hit) return hit;
  }
  return null;
}

// Whatever Gemini returns → a 1080×1080 JPEG (Instagram only accepts JPEG).
// `contain` on white: a non-square image is padded, never cropped, so no text is cut.
export function toInstagramJpeg(bytes) {
  return sharp(bytes)
    .rotate()
    .resize(1080, 1080, { fit: 'contain', background: '#ffffff' })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

// Generate the post image. Tries the Interactions API (asks for a square JPEG),
// then falls back to generateContent for keys/models that predate it.
// `references` are optional style images: [{ data: base64, mimeType }].
export async function generateImage(prompt, apiKey, references = []) {
  const headers = { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' };
  let firstErr;
  try {
    const input = references.length
      ? [{ type: 'text', text: prompt }, ...references.map((r) => ({ type: 'image', data: r.data, mime_type: r.mimeType }))]
      : prompt;
    const { data } = await geminiHttp.post('/interactions', {
      model: config.gemini.imageModel,
      input,
      response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '1:1' },
    }, { headers });
    const img = findImage(data);
    if (img) return toInstagramJpeg(Buffer.from(img.b64, 'base64'));
    firstErr = new Error('Gemini image: no image in the response');
  } catch (err) {
    // Only an unsupported endpoint/shape falls through; a bad key or quota error won't change.
    const unsupported = [400, 404].includes(err.response?.status) && !/^API_KEY/.test(errorReason(err) || '');
    if (!unsupported) throw geminiError(err, 'image');
    firstErr = geminiError(err, 'image');
  }

  try {
    const parts = [{ text: prompt }, ...references.map((r) => ({ inlineData: { mimeType: r.mimeType, data: r.data } }))];
    const { data } = await geminiHttp.post(`/models/${config.gemini.imageModel}:generateContent`, {
      contents: [{ role: 'user', parts }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }, { headers });
    const img = findImage(data?.candidates);
    if (!img) throw new Error('Gemini image: no image in the response');
    return toInstagramJpeg(Buffer.from(img.b64, 'base64'));
  } catch (err) {
    const second = err.response ? geminiError(err, 'image') : err;
    throw new Error(`${second.message} (Interactions API: ${firstErr.message})`.slice(0, 400));
  }
}

// The quality gate: Gemini reads the text actually rendered and scores it against
// what was intended. Text fidelity dominates; uncertain → fail.
export async function scoreImage(jpeg, intended, dna, apiKey) {
  try {
    const { data } = await geminiHttp.post(`/models/${config.gemini.visionModel}:generateContent`, {
      contents: [{
        role: 'user',
        parts: [
          { text: buildVisionPrompt(intended, dna) },
          { inlineData: { mimeType: 'image/jpeg', data: jpeg.toString('base64') } },
        ],
      }],
      generationConfig: { responseMimeType: 'application/json' },
    }, { headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' }, timeout: 60000 });
    // Thinking models may emit thought parts first; take the last text part.
    const texts = (data?.candidates?.[0]?.content?.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text);
    const text = texts[texts.length - 1];
    if (!text) throw new Error('Gemini vision returned no verdict');
    return parseVerdict(JSON.parse(text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '')));
  } catch (err) {
    throw err.response ? geminiError(err, 'quality check') : err;
  }
}

// Live check that a key can reach both configured models (no tokens spent).
export async function checkGeminiModels(apiKey) {
  const models = [...new Set([config.gemini.imageModel, config.gemini.visionModel])];
  for (const model of models) {
    try {
      await geminiHttp.get(`/models/${model}`, { headers: { 'x-goog-api-key': apiKey }, timeout: 10000 });
    } catch (err) {
      if (err.response?.status === 404) return { ok: false, detail: `model "${model}" not found — set GEMINI_IMAGE_MODEL / GEMINI_VISION_MODEL` };
      return { ok: false, detail: geminiError(err, 'check').message };
    }
  }
  return { ok: true, detail: models.join(' + ') };
}

// ─── Campaign reference images (user URLs → SSRF-guarded fetch) ─────────────

const refHttp = axios.create({ ...safeAxiosConfig, timeout: 15000, maxRedirects: 3, maxContentLength: 6 * 1024 * 1024, responseType: 'arraybuffer' });

// Up to 3 reference images as small JPEGs for Gemini; unreadable ones are skipped.
export async function loadReferenceImages(urls) {
  const out = [];
  for (const url of (urls || []).slice(0, 3)) {
    try {
      const res = await refHttp.get(url);
      if (!/^image\//.test(String(res.headers['content-type'] || ''))) continue;
      const jpeg = await sharp(Buffer.from(res.data)).rotate().resize(768, 768, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer();
      out.push({ data: jpeg.toString('base64'), mimeType: 'image/jpeg' });
    } catch { /* best-effort: a bad reference never blocks a post */ }
  }
  return out;
}

// ─── Storage ────────────────────────────────────────────────────────────────

export async function saveImage(jpeg) {
  await mkdir(MEDIA_DIR, { recursive: true });
  const file = `${randomBytes(16).toString('hex')}.jpg`;
  await writeFile(resolve(MEDIA_DIR, file), jpeg);
  return file;
}

export async function deleteImage(file) {
  if (!file || !FILE_RE.test(file)) return;
  await unlink(resolve(MEDIA_DIR, file)).catch(() => {});
}

// Public URL Instagram downloads the image from.
export const publicImageUrl = (file) => `${config.publicBaseUrl}/api/media/ig/${file}`;

// Instagram can't download from a private address, so publishing needs a public base URL.
export function publicUrlProblem() {
  let host;
  try { host = new URL(config.publicBaseUrl).hostname; } catch { return 'PUBLIC_BASE_URL is not a valid URL.'; }
  if (/^(localhost|127\.|10\.|192\.168\.|0\.0\.0\.0)/.test(host) || host.endsWith('.local')) {
    return `Instagram can't download images from ${config.publicBaseUrl}. Publishing works on the live site (set PUBLIC_BASE_URL to its https address).`;
  }
  return null;
}
