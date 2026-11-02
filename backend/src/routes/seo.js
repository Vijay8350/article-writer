import { Router } from 'express';
import config from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace, requireWorkspaceRole } from '../middleware/workspace.js';
import * as repo from '../repositories/seo.js';
import * as stores from '../repositories/stores.js';
import * as dnaRepo from '../repositories/dna.js';
import * as gsc from '../services/searchConsole.js';
import { createState, verifyState } from '../services/facebookLogin.js';
import { runAudit, loadIssuePage } from '../services/seoAudit.js';
import { fixOne, undoChange, suggestMeta, cleanManualMeta } from '../services/seoFixes.js';
import { ISSUE_TYPES } from '../lib/seoRules.js';

// SEO automation (/api/seo). The Google callback is public, because Google calls it, and
// authenticates with a signed state. Everything else needs a signed-in workspace member,
// and anything that changes the store or the schedule needs an owner or admin.

const router = Router();
const NONCE_COOKIE = 'seo_oauth_nonce';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_FIXES = 50;

const isValidTimezone = (tz) => { try { Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };
const bad = (res, error, status = 400) => res.status(status).json({ success: false, error });

function fail(res, next, err) {
  if (err.status) return bad(res, err.message, err.status);
  return next(err);
}

const readCookie = (req, name) => {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
};

function backToApp(res, params) {
  const dest = new URL('/seo', config.frontendUrl);
  for (const [k, v] of Object.entries(params)) dest.searchParams.set(k, String(v).slice(0, 160));
  res.setHeader('Set-Cookie', `${NONCE_COOKIE}=; Path=/api/seo; Max-Age=0`);
  res.redirect(dest.toString());
}

// Picks the store's property automatically when there's an obvious one.
async function chooseSite(workspaceId, refreshToken) {
  const dna = await dnaRepo.getDna(workspaceId);
  const token = await gsc.accessToken(refreshToken);
  const sites = await gsc.listSites(token);
  const site = gsc.matchSite(sites, dna?.shop?.domain);
  if (site) await repo.setGoogleSite(workspaceId, site);
  return { site, sites };
}

router.get('/google/callback', async (req, res) => {
  if (req.query.error) return backToApp(res, { google_error: 'Google sign-in was cancelled.' });
  const who = verifyState(req.query.state, readCookie(req, NONCE_COOKIE));
  if (!who || !req.query.code) return backToApp(res, { google_error: 'That sign-in link expired. Please try again.' });
  try {
    const { refreshToken, email } = await gsc.exchangeCode(req.query.code);
    if (!refreshToken) return backToApp(res, { google_error: 'Google did not allow offline access. Please try again.' });
    await repo.saveGoogle(who.workspaceId, { refreshToken, email });
    const { site } = await chooseSite(who.workspaceId, refreshToken);
    return backToApp(res, site ? { google_connected: site } : { google_connected: 'pick', google_note: 'Choose your site below.' });
  } catch (err) {
    console.error('[seo] Google sign-in failed:', err.response?.data?.error_description || err.message);
    return backToApp(res, { google_error: 'Google sign-in failed. Please try again.' });
  }
});

router.use(requireAuth, requireWorkspace);
const manage = requireWorkspaceRole('owner', 'admin');

router.param('id', (req, res, next, id) => (UUID_RE.test(id) ? next() : bad(res, 'Not found', 404)));

const labelled = (issue) => {
  const kind = ISSUE_TYPES[issue.type];
  return { ...issue, label: kind?.label || issue.type, fixable: Boolean(kind?.fix), fixKind: kind?.fix || null, advice: kind?.advice || null };
};

// The store and the one page an issue is about. When there's none, it has already
// answered the request with the reason and returns null.
async function issueContext(req, res) {
  const refuse = (error, status) => { bad(res, error, status); return null; };
  const issue = await repo.getIssue(req.workspace.id, req.params.id);
  if (!issue) return refuse('Issue not found', 404);
  if (!ISSUE_TYPES[issue.type]?.fix) return refuse(ISSUE_TYPES[issue.type]?.advice || "This one can't be fixed automatically.");
  const [creds, dna] = await Promise.all([stores.getDefaultStore(req.workspace.id), dnaRepo.getDna(req.workspace.id)]);
  if (!creds) return refuse('No Shopify store is connected.');
  if (!dna?.shop?.domain) return refuse('Fetch your Business DNA first, so the store domain is known.');
  const { page, live } = await loadIssuePage(creds, dna.shop.domain, issue);
  if (!page) return refuse('This page is no longer published on your store.', 404);
  return { issue, creds, page, live, storeName: dna.shop.name };
}

router.get('/overview', async (req, res, next) => {
  try {
    const [settings, audits, counts, types] = await Promise.all([
      repo.getSettings(req.workspace.id), repo.recentAudits(req.workspace.id), repo.issueCounts(req.workspace.id), repo.issueTypeCounts(req.workspace.id),
    ]);
    res.json({
      success: true,
      data: {
        settings,
        audits,
        counts,
        types: types.map((t) => ({ ...t, label: ISSUE_TYPES[t.type]?.label || t.type })),
        running: audits[0]?.status === 'running',
        google: { configured: gsc.isConfigured(), redirectUri: gsc.redirectUri() },
      },
    });
  } catch (error) { next(error); }
});

router.put('/settings', manage, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (b.runTime !== undefined && !TIME_RE.test(b.runTime)) return bad(res, 'Run time must be HH:MM (24-hour)');
    if (b.timezone !== undefined && !isValidTimezone(b.timezone)) return bad(res, 'Invalid time zone');
    const flag = (v) => (v === undefined ? undefined : Boolean(v));
    const settings = await repo.updateSettings(req.workspace.id, {
      enabled: flag(b.enabled), runTime: b.runTime, timezone: b.timezone,
      maxFixes: b.maxFixes === undefined ? undefined : Math.min(Math.max(parseInt(b.maxFixes) || 1, 1), MAX_FIXES),
      fixMeta: flag(b.fixMeta), fixAlt: flag(b.fixAlt), fixLinks: flag(b.fixLinks), fixArticles: flag(b.fixArticles),
    });
    res.json({ success: true, data: settings, message: 'SEO automation saved' });
  } catch (error) { next(error); }
});

// Starts a check and returns straight away: a full site takes minutes. The page polls.
router.post('/audit', manage, async (req, res, next) => {
  try {
    if (!(await repo.claimManual(req.workspace.id))) return bad(res, 'A check is already running.', 409);
    const applying = req.body?.applyFixes === true;
    const workspaceId = req.workspace.id;
    runAudit(workspaceId, { trigger: 'manual', applying })
      .catch((err) => console.error(`❌ SEO audit ${workspaceId} failed: ${err.message}`))
      .finally(() => repo.finishRun(workspaceId));
    res.json({ success: true, message: 'Site check started' });
  } catch (error) { next(error); }
});

router.get('/issues', async (req, res, next) => {
  try {
    const status = ['open', 'fixed', 'resolved', 'ignored'].includes(req.query.status) ? req.query.status : 'open';
    const type = ISSUE_TYPES[req.query.type] ? req.query.type : null;
    const [issues, types] = await Promise.all([repo.listIssues(req.workspace.id, status, { type }), repo.issueTypeCounts(req.workspace.id, status)]);
    res.json({
      success: true,
      data: issues.map(labelled),
      types: types.map((t) => ({ ...t, label: ISSUE_TYPES[t.type]?.label || t.type })),
    });
  } catch (error) { next(error); }
});

router.post('/issues/:id/ignore', manage, async (req, res, next) => {
  try {
    await repo.setIssueStatus(req.workspace.id, req.params.id, 'ignored');
    res.json({ success: true, message: 'Ignored. The daily run will leave it alone.' });
  } catch (error) { next(error); }
});

router.post('/issues/:id/restore', manage, async (req, res, next) => {
  try {
    await repo.setIssueStatus(req.workspace.id, req.params.id, 'open');
    res.json({ success: true, message: 'Back on the open list' });
  } catch (error) { next(error); }
});

// The editor's starting point for a title or description problem. Changes nothing.
router.post('/issues/:id/suggest', manage, async (req, res, next) => {
  try {
    const ctx = await issueContext(req, res);
    if (!ctx) return undefined;
    if (ISSUE_TYPES[ctx.issue.type].fix !== 'meta') return bad(res, 'Only title and description problems have an editor.');
    const result = await suggestMeta({ workspaceId: req.workspace.id, creds: ctx.creds, page: ctx.page, storeName: ctx.storeName });
    res.json({ success: true, data: { ...result, storeName: ctx.storeName, page: { name: ctx.page.name, url: ctx.page.url, type: ctx.page.type } } });
  } catch (err) { fail(res, next, err); }
});

// Fixes one problem now. For a title or description, the body may carry the owner's own
// wording (seoTitle, seoDescription), which is saved instead of asking the AI.
router.post('/issues/:id/fix', manage, async (req, res, next) => {
  try {
    const manual = req.body?.seoTitle !== undefined || req.body?.seoDescription !== undefined ? cleanManualMeta(req.body) : undefined;
    const ctx = await issueContext(req, res);
    if (!ctx) return undefined;
    await fixOne({ workspaceId: req.workspace.id, creds: ctx.creds, issue: ctx.issue, page: ctx.page, live: ctx.live, storeName: ctx.storeName, manual });
    res.json({ success: true, message: 'Saved to your store. You can undo it under Changes made.' });
  } catch (err) { fail(res, next, err); }
});

router.get('/changes', async (req, res, next) => {
  try { res.json({ success: true, data: await repo.listChanges(req.workspace.id) }); }
  catch (error) { next(error); }
});

router.post('/changes/:id/undo', manage, async (req, res, next) => {
  try {
    const creds = await stores.getDefaultStore(req.workspace.id);
    if (!creds) return bad(res, 'No Shopify store is connected.');
    await undoChange(req.workspace.id, creds, req.params.id);
    res.json({ success: true, message: 'Change undone' });
  } catch (err) { fail(res, next, err); }
});

// ─── Google Search Console ───────────────────────────────────────────────────

router.post('/google/start', manage, (req, res) => {
  if (!gsc.isConfigured()) return bad(res, 'Google sign-in is not set up yet: add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the server .env.');
  const { state, nonce } = createState({ workspaceId: req.workspace.id, userId: req.user.id });
  const secure = config.nodeEnv === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${NONCE_COOKIE}=${nonce}; Path=/api/seo; HttpOnly; SameSite=Lax; Max-Age=600${secure}`);
  res.json({ success: true, data: { url: gsc.authUrl(state) } });
});

router.get('/google/sites', async (req, res, next) => {
  try {
    const refreshToken = await repo.googleToken(req.workspace.id);
    if (!refreshToken) return bad(res, 'Google is not connected.');
    res.json({ success: true, data: await gsc.listSites(await gsc.accessToken(refreshToken)) });
  } catch (error) { next(error); }
});

router.put('/google/site', manage, async (req, res, next) => {
  try {
    if (!req.body?.site) return bad(res, 'Pick a site');
    await repo.setGoogleSite(req.workspace.id, req.body.site);
    res.json({ success: true, message: 'Search Console site saved' });
  } catch (error) { next(error); }
});

router.delete('/google', manage, async (req, res, next) => {
  try {
    await repo.clearGoogle(req.workspace.id);
    res.json({ success: true, message: 'Google disconnected' });
  } catch (error) { next(error); }
});

export default router;
