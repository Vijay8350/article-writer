import { createHash } from 'crypto';

// Validators for the model JSON Instagram Studio consumes (ported from the
// tool's zod schemas). Lenient on shape — models sometimes return a string for a
// list or objects for list items — but strict on values. A throw means "invalid
// output": the caller retries the model call.

const invalid = (msg) => new Error(`invalid model output: ${msg}`);

// Whatever the model put in a text slot (string, number, {name, description}) → a string.
function toText(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v && typeof v === 'object') {
    return Object.values(v).filter((x) => typeof x === 'string' || typeof x === 'number').join(' — ');
  }
  return '';
}

const optText = (v, max) => (v == null ? null : toText(v).trim().slice(0, max) || null);

const textList = (v) => [...new Set(
  (v == null ? [] : Array.isArray(v) ? v : [v]).map((x) => toText(x).trim().slice(0, 300)).filter(Boolean),
)].slice(0, 12);

function reqText(v, field) {
  const s = toText(v).trim();
  if (!s) throw invalid(`"${field}" is missing`);
  return s;
}

// Normalized hash of an idea's essence — per-account de-duplication so trivially
// different phrasings of the same idea collide.
export function normalizeHash(text) {
  const normalized = String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return createHash('sha256').update(normalized).digest('hex');
}

// Stage 1 — a single fresh idea.
export function parseIdea(raw) {
  return {
    theme: reqText(raw?.theme, 'theme'),
    angle: reqText(raw?.angle, 'angle'),
    format: reqText(raw?.format, 'format'),
    summary: reqText(raw?.summary, 'summary'),
  };
}

// Stage 2 — on-image text + caption + hashtags (hashtags normalized to one leading '#').
export function parseContent(raw) {
  const headline = reqText(raw?.headline, 'headline');
  const lines = (Array.isArray(raw?.lines) ? raw.lines : []).map((l) => toText(l).trim()).filter(Boolean);
  if (!lines.length || lines.length > 8) throw invalid('"lines" must have 1–8 items');
  const caption = reqText(raw?.caption, 'caption');
  const hashtags = [...new Set((Array.isArray(raw?.hashtags) ? raw.hashtags : [])
    .map((h) => `#${toText(h).replace(/[#\s]/g, '')}`)
    .filter((h) => h.length > 1))].slice(0, 30);
  if (!hashtags.length) throw invalid('"hashtags" is empty');
  return { headline, lines, caption, hashtags };
}

// Stage 4 — quality-gate verdict.
export function parseVerdict(raw) {
  if (typeof raw?.pass !== 'boolean') throw invalid('"pass" must be a boolean');
  const score = Number(raw.score);
  if (!Number.isFinite(score) || score < 0 || score > 100) throw invalid('"score" must be 0–100');
  return {
    pass: raw.pass,
    score: Math.round(score),
    reasons: (Array.isArray(raw.reasons) ? raw.reasons : []).map((r) => toText(r).trim()).filter(Boolean).slice(0, 10),
    renderedText: optText(raw.rendered_text, 500),
  };
}

// Business DNA (from research). summary is the one required field.
export function parseBusinessDna(raw) {
  const summary = toText(raw?.summary).trim().slice(0, 1200);
  if (!summary) throw invalid('"summary" is missing');
  return {
    business_name: optText(raw.business_name, 120),
    summary,
    industry: optText(raw.industry, 160),
    offerings: textList(raw.offerings),
    usps: textList(raw.usps),
    target_customers: optText(raw.target_customers, 600),
    brand_voice: optText(raw.brand_voice, 600),
    tone: optText(raw.tone, 200),
    brand_values: textList(raw.brand_values),
    key_messages: textList(raw.key_messages),
    content_themes: textList(raw.content_themes),
    ctas: textList(raw.ctas),
    keywords: textList(raw.keywords),
    visual_cues: optText(raw.visual_cues, 600),
    language: optText(raw.language, 60),
    dos: textList(raw.dos),
    donts: textList(raw.donts),
  };
}

// Research step 2: the Business DNA written from the dossier, plus what it couldn't establish.
export const parseSynthesis = (raw) => ({ ...parseBusinessDna(raw), gaps: textList(raw?.gaps) });

export const RESEARCH_FACT_CATEGORIES = ['identity', 'offering', 'pricing', 'usp', 'audience', 'voice', 'values',
  'social_proof', 'policy', 'location', 'contact', 'visual', 'other'];

// Research step 1 (per excerpt): facts are validated one by one — a malformed
// fact is dropped, not the whole excerpt.
export function parseResearchExtract(raw) {
  const facts = [];
  for (const f of Array.isArray(raw?.facts) ? raw.facts : []) {
    const fact = toText(f?.fact).trim().slice(0, 300);
    if (fact.length < 3) continue;
    const cat = typeof f.category === 'string' ? f.category.toLowerCase().trim().replace(/[\s-]+/g, '_') : 'other';
    facts.push({
      category: RESEARCH_FACT_CATEGORIES.includes(cat) ? cat : 'other',
      fact,
      evidence: optText(f.evidence, 200),
    });
    if (facts.length >= 60) break;
  }
  return { facts, voice_samples: textList(raw?.voice_samples), customer_signals: textList(raw?.customer_signals) };
}

const VERDICTS = ['positive', 'question', 'neutral', 'bad'];
const BAD_CATEGORIES = ['spam', 'scam', 'abuse', 'hate', 'sexual', 'self_promotion', 'other'];

// Comment review: one verdict per comment. Unusable items are dropped (the caller
// marks a comment without a verdict as an error rather than guessing).
export function parseCommentReview(raw) {
  if (!Array.isArray(raw?.results)) throw invalid('"results" must be an array');
  const out = [];
  for (const r of raw.results) {
    const id = toText(r?.id).trim();
    const verdict = typeof r?.verdict === 'string' ? r.verdict.toLowerCase().trim() : '';
    if (!id || !VERDICTS.includes(verdict)) continue;
    const cat = typeof r.category === 'string' ? r.category.toLowerCase().trim().replace(/[\s-]+/g, '_') : null;
    const confidence = Number(r.confidence);
    out.push({
      id,
      verdict,
      category: cat == null ? null : BAD_CATEGORIES.includes(cat) ? cat : 'other',
      reason: optText(r.reason, 200),
      confidence: Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : 0,
      reply: optText(r.reply, 300),
    });
  }
  return out;
}

const LINKISH = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|in|io|co|me|ly|link|app|shop|store|xyz|info|biz)\b)/i;
const CONTACTISH = /(\S+@\S+\.\S+|\+?\d[\d\s().-]{7,}\d)/;

// A model-drafted reply made safe to post publicly, or null. Replies with links,
// emails or phone numbers are dropped outright (a comment could have talked the
// model into advertising something); hashtags and @mentions are stripped;
// overlong replies are dropped rather than cut mid-sentence.
export function sanitizeCommentReply(reply) {
  if (!reply) return null;
  if (LINKISH.test(reply) || CONTACTISH.test(reply)) return null;
  const clean = reply
    .replace(/#[\p{L}\p{N}_]+/gu, '')
    .replace(/(^|\s)@[\w.]+/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/\s+([!?.,:;])/g, '$1')
    .trim();
  if (!clean || clean.length > 300) return null;
  return clean;
}
