import { Router } from 'express';
import config from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace, requireWorkspaceRole } from '../middleware/workspace.js';
import * as repo from '../repositories/igStudio.js';
import * as igRepo from '../repositories/instagram.js';
import * as studio from '../services/igStudio.js';
import * as media from '../services/igMedia.js';
import { runCommentCycle, sendCommentReply } from '../services/igComments.js';
import { normalizeWebsiteUrl } from '../services/websiteCrawl.js';
import { buildCampaignPrompt } from '../lib/igPrompts.js';
import { setCommentHidden, deleteComment } from '../services/instagram.js';
import { resolveAi } from '../services/ai.js';
import * as deepseek from '../services/deepseek.js';
import { isConfigured as facebookLoginConfigured, redirectUri } from '../services/facebookLogin.js';

// Instagram Studio API (/api/ig). Everyone in the workspace can view and draft
// posts; publishing, schedules, settings and comment actions need owner/admin.

const router = Router();
router.use(requireAuth, requireWorkspace);
const manage = requireWorkspaceRole('owner', 'admin');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const bad = (res, error, status = 400) => res.status(status).json({ success: false, error });
const ok = (res, data, message) => res.json({ success: true, data, ...(message ? { message } : {}) });

// Service errors carry .status (400/402) and maybe .code; anything else is an
// upstream (AI / Instagram) failure the user should still read.
function fail(res, err) {
  if (!err.status) console.error('[igStudio]', err.message);
  return res.status(err.status || 502).json({ success: false, error: err.message, ...(err.code ? { code: err.code } : {}) });
}

const isValidTimezone = (tz) => { try { Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };

// Text helpers for form fields.
const text = (v, max = 2000) => (v == null ? undefined : String(v).trim().slice(0, max) || null);
const lines = (v) => (v == null ? undefined : (Array.isArray(v) ? v : String(v).split('\n'))
  .map((s) => String(s).trim()).filter(Boolean).slice(0, 40).map((s) => s.slice(0, 500)));

// :accountId → the workspace's account (404 otherwise).
async function account(req, res) {
  const id = req.params.accountId;
  const meta = UUID_RE.test(id) ? await igRepo.getAccountMeta(req.workspace.id, id) : null;
  if (!meta) bad(res, 'Instagram account not found', 404);
  return meta;
}

const withImageUrl = (p) => ({ ...p, image_url: p.image_file ? `/api/media/ig/${p.image_file}` : null });

// ─── Readiness (AI keys, models, publishing URL, Facebook Login) ─────────────

const statusCache = new Map(); // workspaceId → { at, value } — avoids hammering the APIs on tab switches

router.get('/status', async (req, res) => {
  const hit = statusCache.get(req.workspace.id);
  if (hit && Date.now() - hit.at < 60_000 && !req.query.fresh) return ok(res, hit.value);

  const deepseekCheck = await (async () => {
    try {
      const ai = await resolveAi(req.workspace.id, 'article', 'deepseek');
      const key = ai.apiKey || config.deepseek.apiKey;
      if (!key) return { ok: false, detail: 'No DeepSeek API key — add one in Settings.' };
      const models = await deepseek.verifyKey(key);
      const usable = models.includes(ai.model) ? ai.model : models[0];
      return { ok: Boolean(usable), detail: `${usable || ai.model} · ${ai.apiKey ? 'workspace key' : 'platform key'}` };
    } catch (err) { return { ok: false, detail: err.message }; }
  })();
  const geminiCheck = await (async () => {
    try { return await media.checkGeminiModels(await media.geminiKeyFor(req.workspace.id)); } catch (err) { return { ok: false, detail: err.message }; }
  })();
  const publishProblem = media.publicUrlProblem();
  const value = {
    deepseek: deepseekCheck,
    gemini: geminiCheck,
    publishing: { ok: !publishProblem, detail: publishProblem || `Images served from ${config.publicBaseUrl}` },
    facebookLogin: { ok: facebookLoginConfigured(), detail: facebookLoginConfigured() ? `Redirect URL: ${redirectUri()}` : 'Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET' },
    maxRegenAttempts: config.instagram.maxRegenAttempts,
  };
  statusCache.set(req.workspace.id, { at: Date.now(), value });
  ok(res, value);
});

// ─── Account DNA + schedule ─────────────────────────────────────────────────

router.get('/accounts/:accountId/dna', async (req, res, next) => {
  try {
    const acc = await account(req, res);
    if (acc) ok(res, await repo.getDna(req.workspace.id, acc.id));
  } catch (err) { next(err); }
});

router.put('/accounts/:accountId/dna', manage, async (req, res, next) => {
  try {
    const acc = await account(req, res);
    if (!acc) return;
    const b = req.body || {};
    const vi = b.visual_identity || {};
    const dna = await repo.upsertDna(req.workspace.id, acc.id, {
      persona: text(b.persona, 500),
      tone: text(b.tone, 300),
      audience: text(b.audience, 500),
      niche: text(b.niche, 300),
      content_pillars: lines(b.content_pillars),
      visual_identity: {
        palette: (Array.isArray(vi.palette) ? vi.palette : String(vi.palette || '').split(/[,\n]/)).map((s) => String(s).trim()).filter(Boolean).slice(0, 12),
        mood: text(vi.mood, 200) || undefined,
        style: text(vi.style, 300) || undefined,
        font: text(vi.font, 200) || undefined,
        layout: text(vi.layout, 200) || undefined,
      },
      language: text(b.language, 60) || 'English',
      dos: lines(b.dos),
      donts: lines(b.donts),
      examples: lines(b.examples),
      hashtag_strategy: text(b.hashtag_strategy, 500),
    });
    ok(res, dna, 'Account DNA saved');
  } catch (err) { next(err); }
});

router.put('/accounts/:accountId/schedule', manage, async (req, res, next) => {
  try {
    const acc = await account(req, res);
    if (!acc) return;
    const { slots = [], timezone = 'Asia/Kolkata', autopilot = false } = req.body || {};
    const clean = [...new Set((Array.isArray(slots) ? slots : []).map((s) => String(s).trim()))];
    if (clean.length > 5) return bad(res, 'At most 5 posting slots per day.');
    if (clean.some((s) => !TIME_RE.test(s))) return bad(res, 'Posting slots must be HH:MM (24-hour).');
    if (!isValidTimezone(timezone)) return bad(res, `Unknown time zone "${timezone}" — use a name like Asia/Kolkata.`);
    const dna = await repo.upsertDna(req.workspace.id, acc.id, { posting_slots: clean.sort(), timezone, autopilot: Boolean(autopilot) });

    // Tell the user now what would make an autopilot run skip later.
    const warnings = [];
    if (dna.autopilot) {
      if (!clean.length) warnings.push('Add at least one posting slot — autopilot does nothing without one.');
      const [prompt, campaign] = await Promise.all([repo.pickPrompt(acc.id, 'quote_idea'), repo.activeCampaignFor(acc.id)]);
      if (!prompt && !campaign) warnings.push('Add an active quote-idea prompt (Prompts tab) or an active campaign — slots are skipped without one.');
      const problem = media.publicUrlProblem();
      if (problem) warnings.push(problem);
      try { await media.geminiKeyFor(req.workspace.id); } catch (err) { warnings.push(err.message); }
    }
    res.json({ success: true, data: dna, warnings, message: 'Schedule saved' });
  } catch (err) { next(err); }
});

// ─── Prompt library ─────────────────────────────────────────────────────────

router.get('/accounts/:accountId/prompts', async (req, res, next) => {
  try {
    const acc = await account(req, res);
    if (acc) ok(res, await repo.listPrompts(req.workspace.id, acc.id));
  } catch (err) { next(err); }
});

router.post('/accounts/:accountId/prompts', manage, async (req, res, next) => {
  try {
    const acc = await account(req, res);
    if (!acc) return;
    const { type, label, promptText } = req.body || {};
    if (!['quote_idea', 'image_idea'].includes(type)) return bad(res, 'type must be quote_idea or image_idea');
    if (!label?.trim() || !promptText?.trim()) return bad(res, 'A label and the prompt text are required.');
    ok(res, await repo.addPrompt(req.workspace.id, acc.id, {
      type, label: label.trim().slice(0, 120), promptText: promptText.trim().slice(0, 2000),
    }), 'Prompt added');
  } catch (err) { next(err); }
});

router.patch('/prompts/:id', manage, async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) return bad(res, 'Prompt not found', 404);
    const row = await repo.updatePrompt(req.workspace.id, req.params.id, { active: typeof req.body?.active === 'boolean' ? req.body.active : undefined });
    if (!row) return bad(res, 'Prompt not found', 404);
    ok(res, row);
  } catch (err) { next(err); }
});

router.delete('/prompts/:id', manage, async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id) || !(await repo.deletePrompt(req.workspace.id, req.params.id))) return bad(res, 'Prompt not found', 404);
    ok(res, null, 'Prompt deleted');
  } catch (err) { next(err); }
});

// ─── Posts: generate → image (+ quality gate) → publish ─────────────────────

router.get('/accounts/:accountId/posts', async (req, res, next) => {
  try {
    const acc = await account(req, res);
    if (acc) ok(res, (await repo.listPosts(req.workspace.id, acc.id)).map(withImageUrl));
  } catch (err) { next(err); }
});

// { promptId } or { adhoc } (adhoc wins); { withImage: true } also runs the image + quality gate.
router.post('/accounts/:accountId/posts', async (req, res) => {
  try {
    const acc = await account(req, res);
    if (!acc) return;
    const { promptId, adhoc, withImage } = req.body || {};
    let promptText = String(adhoc || '').trim().slice(0, 1000);
    let sourcePromptId = null;
    if (!promptText && promptId && UUID_RE.test(promptId)) {
      const p = await repo.getPrompt(req.workspace.id, acc.id, promptId);
      if (p) { promptText = p.prompt_text; sourcePromptId = p.id; }
    }
    if (!promptText) return bad(res, 'Choose a prompt or type a point to generate from.');
    let post = await studio.generatePostText(req.workspace.id, acc.id, { promptText, sourcePromptId, origin: 'manual', userId: req.user.id });
    if (withImage) {
      try { post = await studio.generatePostImage(req.workspace.id, post.id); } catch (err) {
        return res.json({ success: true, data: withImageUrl(await repo.getPost(req.workspace.id, post.id)), warning: `Text saved, but the image failed: ${err.message}` });
      }
    }
    ok(res, withImageUrl(post), withImage ? (post.status === 'ready' ? 'Post ready to publish' : 'Image failed the quality check') : 'Post text generated');
  } catch (err) { fail(res, err); }
});

router.post('/posts/:id/image', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return bad(res, 'Post not found', 404);
    const post = await studio.generatePostImage(req.workspace.id, req.params.id);
    ok(res, withImageUrl(post), post.status === 'ready' ? 'Image passed the quality check' : 'Image failed the quality check');
  } catch (err) { fail(res, err); }
});

router.post('/posts/:id/publish', manage, async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return bad(res, 'Post not found', 404);
    ok(res, withImageUrl(await studio.publishGeneratedPost(req.workspace.id, req.params.id)), 'Published to Instagram');
  } catch (err) { fail(res, err); }
});

router.delete('/posts/:id', manage, async (req, res, next) => {
  try {
    const row = UUID_RE.test(req.params.id) ? await repo.deletePost(req.workspace.id, req.params.id) : null;
    if (!row) return bad(res, 'Post not found or busy', 404);
    await media.deleteImage(row.image_file);
    ok(res, null, 'Post deleted');
  } catch (err) { next(err); }
});

// ─── Business DNA (deep research) ───────────────────────────────────────────

const RUNNING = ['queued', 'researching', 'analyzing'];
const STALE_MS = 15 * 60_000;

router.get('/accounts/:accountId/business-dna', async (req, res, next) => {
  try {
    const acc = await account(req, res);
    if (acc) ok(res, await repo.getBusinessDna(req.workspace.id, acc.id));
  } catch (err) { next(err); }
});

router.post('/accounts/:accountId/business-dna/research', manage, async (req, res, next) => {
  try {
    const acc = await account(req, res);
    if (!acc) return;
    const includeInstagram = req.body?.includeInstagram !== false;
    let websiteUrl = null;
    if (req.body?.websiteUrl?.trim()) {
      try { websiteUrl = normalizeWebsiteUrl(req.body.websiteUrl); } catch (err) { return bad(res, `Website: ${err.message}`); }
    }
    if (!includeInstagram && !websiteUrl) return bad(res, "Add a website URL or include Instagram — there's nothing to research.");
    const current = await repo.getBusinessDna(req.workspace.id, acc.id);
    const since = current?.research_started_at || current?.updated_at;
    if (current && RUNNING.includes(current.research_status) && since && Date.now() - new Date(since).getTime() < STALE_MS) {
      return bad(res, 'Research is already running for this account.');
    }
    const now = new Date().toISOString();
    const row = await repo.queueResearch(req.workspace.id, acc.id,
      { website_url: websiteUrl, include_instagram: includeInstagram, requested_at: now },
      [{ at: now, step: 'Queued — waiting for the research worker' }]);
    ok(res, row, 'Deep research started — it takes 1–3 minutes. You can leave this page.');
  } catch (err) { next(err); }
});

router.put('/accounts/:accountId/business-dna', manage, async (req, res, next) => {
  try {
    const acc = await account(req, res);
    if (!acc) return;
    if (!(await repo.getBusinessDna(req.workspace.id, acc.id))) return bad(res, 'Build the Business DNA first.');
    const b = req.body || {};
    let website;
    if (b.website_url !== undefined) {
      try { website = b.website_url?.trim() ? normalizeWebsiteUrl(b.website_url) : null; } catch (err) { return bad(res, `Website: ${err.message}`); }
    }
    const row = await repo.saveBusinessDna(req.workspace.id, acc.id, {
      business_name: text(b.business_name, 120), website_url: website, summary: text(b.summary, 1200),
      industry: text(b.industry, 160), offerings: lines(b.offerings), usps: lines(b.usps),
      target_customers: text(b.target_customers, 600), brand_voice: text(b.brand_voice, 600), tone: text(b.tone, 200),
      brand_values: lines(b.brand_values), key_messages: lines(b.key_messages), content_themes: lines(b.content_themes),
      ctas: lines(b.ctas), keywords: lines(b.keywords), visual_cues: text(b.visual_cues, 600), language: text(b.language, 60),
      dos: lines(b.dos), donts: lines(b.donts),
      use_in_generation: typeof b.use_in_generation === 'boolean' ? b.use_in_generation : undefined,
    });
    ok(res, row, 'Business DNA saved');
  } catch (err) { next(err); }
});

router.post('/accounts/:accountId/business-dna/apply', manage, async (req, res, next) => {
  try {
    const acc = await account(req, res);
    if (!acc) return;
    const [biz, dna] = await Promise.all([repo.getBusinessDna(req.workspace.id, acc.id), repo.getDna(req.workspace.id, acc.id)]);
    if (!biz?.generated_at) return bad(res, 'Build the Business DNA first.');
    const { patch, fields } = studio.businessToAccountDnaPatch(biz, dna);
    if (!fields.length) return bad(res, 'The Business DNA has nothing to apply yet.');
    ok(res, await repo.upsertDna(req.workspace.id, acc.id, patch), `Applied to Account DNA: ${fields.join(', ')}.`);
  } catch (err) { next(err); }
});

// ─── Comments ───────────────────────────────────────────────────────────────

router.get('/comments', async (req, res, next) => {
  try {
    const accountId = UUID_RE.test(req.query.accountId || '') ? req.query.accountId : null;
    const [comments, counts, settings] = await Promise.all([
      repo.listComments(req.workspace.id, { accountId, filter: req.query.filter }),
      repo.commentCounts(req.workspace.id),
      repo.listCommentSettings(req.workspace.id),
    ]);
    ok(res, { comments, counts, settings });
  } catch (err) { next(err); }
});

router.put('/accounts/:accountId/comment-settings', manage, async (req, res, next) => {
  try {
    const acc = await account(req, res);
    if (!acc) return;
    const { replyMode = 'review', autoHide = true, dailyReplyLimit = 30 } = req.body || {};
    if (!['off', 'review', 'auto'].includes(replyMode)) return bad(res, 'Pick a reply mode.');
    const limit = Math.round(Number(dailyReplyLimit));
    if (!Number.isFinite(limit) || limit < 0 || limit > 200) return bad(res, 'Daily reply limit must be between 0 and 200.');
    ok(res, await repo.upsertCommentSettings(req.workspace.id, acc.id, { replyMode, autoHide: Boolean(autoHide), dailyReplyLimit: limit }), 'Comment settings saved');
  } catch (err) { next(err); }
});

// One pass now (same engine as the scheduler), capped to one AI batch so the request stays short.
router.post('/accounts/:accountId/comments/check', manage, async (req, res, next) => {
  try {
    const acc = await account(req, res);
    if (!acc) return;
    const settings = await repo.getCommentSettings(req.workspace.id, acc.id);
    if (!settings) return bad(res, 'Save the comment settings first to switch monitoring on.');
    const r = await runCommentCycle(req.workspace.id, acc.id, settings, { maxReview: 15 });
    if (r.error) return bad(res, r.error);
    ok(res, r, r.reviewed
      ? `Reviewed ${r.reviewed} new comment${r.reviewed === 1 ? '' : 's'}: ${r.flagged} flagged (${r.hidden} hidden), ${r.replied} replied, ${r.drafted} drafts.`
      : `No new comments in the last 3 days (${r.fetched} seen).`);
  } catch (err) { next(err); }
});

// :id → the workspace's comment + its account (with token).
async function commentWithAccount(req, res) {
  const row = UUID_RE.test(req.params.id) ? await repo.getComment(req.workspace.id, req.params.id) : null;
  if (!row) { bad(res, 'Comment not found', 404); return null; }
  const acc = await igRepo.getAccountWithToken(row.account_id);
  if (!acc) { bad(res, 'The Instagram account is no longer connected.'); return null; }
  return { row, acc };
}

router.post('/comments/:id/reply', manage, async (req, res, next) => {
  try {
    const c = await commentWithAccount(req, res);
    if (!c) return;
    const r = await sendCommentReply(c.acc, c.row, req.body?.text ?? c.row.reply_text);
    if (!r.ok) return bad(res, r.error);
    ok(res, null, 'Reply posted');
  } catch (err) { next(err); }
});

router.post('/comments/:id/:action(skip|approve|hide|delete)', manage, async (req, res, next) => {
  try {
    const c = await commentWithAccount(req, res);
    if (!c) return;
    const { row, acc } = c;
    const now = new Date();
    try {
      switch (req.params.action) {
        case 'skip': // don't reply to this one
          if (!['new', 'draft', 'error'].includes(row.status)) return bad(res, 'This comment was already handled.');
          await repo.updateComment(row.id, { status: 'done' });
          break;
        case 'approve': // flagged, but fine → unhide
          if (row.hidden) await setCommentHidden(acc, row.ig_comment_id, false);
          await repo.updateComment(row.id, { status: 'approved', hidden: false, error: null, reviewed_at: now });
          break;
        case 'hide': // agree it's bad → keep it hidden
          if (!row.hidden) await setCommentHidden(acc, row.ig_comment_id, true);
          await repo.updateComment(row.id, { status: 'reviewed', hidden: true, error: null, reviewed_at: now });
          break;
        case 'delete': // remove from Instagram for good
          await deleteComment(acc, row.ig_comment_id);
          await repo.updateComment(row.id, { status: 'deleted', error: null, reviewed_at: now });
          break;
        default:
      }
    } catch (err) {
      await repo.updateComment(row.id, { error: `Couldn't ${req.params.action}: ${err.message}`.slice(0, 300) });
      return bad(res, err.message);
    }
    ok(res, null, 'Done');
  } catch (err) { next(err); }
});

// ─── Campaigns ──────────────────────────────────────────────────────────────

router.get('/campaigns', async (req, res, next) => {
  try { ok(res, await repo.listCampaigns(req.workspace.id)); } catch (err) { next(err); }
});

router.post('/campaigns', manage, async (req, res, next) => {
  try {
    const b = req.body || {};
    const acc = UUID_RE.test(b.accountId || '') ? await igRepo.getAccountMeta(req.workspace.id, b.accountId) : null;
    if (!acc) return bad(res, 'Pick a connected Instagram account.');
    const perDay = Math.min(Math.max(parseInt(b.perDay) || 1, 1), 5);
    const days = Math.min(Math.max(parseInt(b.days) || 7, 1), 90);
    const referenceImages = (Array.isArray(b.referenceImages) ? b.referenceImages : String(b.referenceImages || '').split('\n'))
      .map((s) => String(s).trim()).filter((s) => /^https?:\/\//i.test(s)).slice(0, 3);
    const name = text(b.name, 120) || 'Untitled campaign';
    const fields = {
      accountId: acc.id, name, topic: text(b.topic, 300), goal: text(b.goal, 100) || 'Engagement & saves',
      tone: text(b.tone, 100) || 'Calm & wise', perDay, days, referenceImages,
    };
    fields.prompt = buildCampaignPrompt({
      name, handle: acc.username || 'account', topic: fields.topic, goal: fields.goal, tone: fields.tone, perDay, days, hasRefs: referenceImages.length > 0,
    });
    ok(res, await repo.createCampaign(req.workspace.id, req.user.id, fields), 'Campaign created');
  } catch (err) { next(err); }
});

router.patch('/campaigns/:id', manage, async (req, res, next) => {
  try {
    const status = req.body?.status;
    if (!['active', 'paused'].includes(status)) return bad(res, 'status must be active or paused');
    if (!UUID_RE.test(req.params.id) || !(await repo.setCampaignStatus(req.workspace.id, req.params.id, status))) return bad(res, 'Campaign not found', 404);
    ok(res, null, status === 'active' ? 'Campaign resumed' : 'Campaign paused');
  } catch (err) { next(err); }
});

router.delete('/campaigns/:id', manage, async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id) || !(await repo.deleteCampaign(req.workspace.id, req.params.id))) return bad(res, 'Campaign not found', 404);
    ok(res, null, 'Campaign deleted');
  } catch (err) { next(err); }
});

router.post('/campaigns/:id/generate', async (req, res) => {
  try {
    const campaign = UUID_RE.test(req.params.id) ? await repo.getCampaign(req.workspace.id, req.params.id) : null;
    if (!campaign) return bad(res, 'Campaign not found', 404);
    if (campaign.status === 'done') return bad(res, 'This campaign already reached its target.');
    const post = await studio.generateFromCampaign(req.workspace.id, campaign, req.user.id);
    ok(res, withImageUrl(post), 'Generated a campaign post — open it in the Studio to make the image and publish.');
  } catch (err) { fail(res, err); }
});

// ─── Analytics + activity ───────────────────────────────────────────────────

router.get('/accounts/:accountId/analytics', async (req, res, next) => {
  try {
    const acc = await account(req, res);
    if (acc) ok(res, (await repo.analytics(req.workspace.id, acc.id)).map(withImageUrl));
  } catch (err) { next(err); }
});

router.get('/accounts/:accountId/logs', async (req, res, next) => {
  try {
    const acc = await account(req, res);
    if (acc) ok(res, await repo.listLogs(req.workspace.id, acc.id));
  } catch (err) { next(err); }
});

export default router;
