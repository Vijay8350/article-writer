import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace, requireWorkspaceRole } from '../middleware/workspace.js';
import * as repo from '../repositories/instagram.js';
import * as igStudio from '../repositories/igStudio.js';
import { deleteImage } from '../services/igMedia.js';
import * as storefront from '../services/storefront.js';
import { identifyAccount, checkAccountStatus } from '../services/instagram.js';
import { previewAutomation, runAutomation } from '../services/instagramAutopost.js';

const router = Router();
router.use(requireAuth, requireWorkspace);
const manage = requireWorkspaceRole('owner', 'admin');

const bad = (res, error, status = 400) => res.status(status).json({ success: false, error });

function isValidTimezone(tz) {
  try { Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The workspace's account for :id, or null (a malformed id is simply "not found").
const findAccount = (req) =>
  (UUID_RE.test(req.params.id) ? repo.getAccountMeta(req.workspace.id, req.params.id) : null);

// ─── Accounts ────────────────────────────────────────────────────────────────

router.get('/accounts', async (req, res, next) => {
  try { res.json({ success: true, data: await repo.listAccounts(req.workspace.id) }); }
  catch (error) { next(error); }
});

router.post('/accounts', manage, async (req, res, next) => {
  try {
    const accessToken = req.body?.accessToken?.trim();
    const igUserId = req.body?.igUserId?.trim() || undefined;
    if (!accessToken) return bad(res, 'Access token is required');
    let identity;
    try { identity = await identifyAccount(accessToken, igUserId); }
    catch (err) { return bad(res, err.message); }
    // Instagram Login tokens generated in the Meta dashboard are long-lived (60 days).
    const tokenExpiresAt = identity.tokenType === 'instagram' ? new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) : null;
    const account = await repo.upsertAccount(req.workspace.id, req.user.id, { ...identity, accessToken, tokenExpiresAt });
    res.status(201).json({ success: true, message: `Connected @${account.username}`, data: account });
  } catch (error) { next(error); }
});

router.delete('/accounts/:id', manage, async (req, res, next) => {
  try {
    if (!(await findAccount(req))) return bad(res, 'Account not found', 404);
    // Studio rows cascade with the account; their image files don't, so remove those too.
    const files = await igStudio.imageFilesForAccount(req.workspace.id, req.params.id);
    await repo.removeAccount(req.workspace.id, req.params.id);
    await Promise.all(files.map(deleteImage));
    res.json({ success: true, message: 'Account disconnected' });
  } catch (error) { next(error); }
});

router.post('/accounts/:id/default', manage, async (req, res, next) => {
  try {
    const account = await findAccount(req);
    if (!account || !(await repo.setDefaultAccount(req.workspace.id, account.id))) return bad(res, 'Account not found', 404);
    res.json({ success: true, message: `@${account.username} is now the default account` });
  } catch (error) { next(error); }
});

// Live profile + API permission check against Instagram; also records the result
// so the accounts list shows the latest connection status without re-checking.
router.get('/accounts/:id/status', async (req, res, next) => {
  try {
    const meta = await findAccount(req);
    if (!meta) return bad(res, 'Account not found', 404);
    const status = await checkAccountStatus(await repo.getAccountWithToken(meta.id));
    await repo.recordConnectionCheck(meta.id, status.tokenError);
    res.json({ success: true, data: { account: await repo.getAccountMeta(req.workspace.id, meta.id), ...status } });
  } catch (error) { next(error); }
});

// ─── Automations ─────────────────────────────────────────────────────────────

router.get('/automations', async (req, res, next) => {
  try { res.json({ success: true, data: await repo.listAutomations(req.workspace.id) }); }
  catch (error) { next(error); }
});

router.post('/automations', manage, async (req, res, next) => {
  try {
    const { siteUrl, accountId, postTime = '10:00', timezone = 'Asia/Kolkata', captionInstructions, hashtags } = req.body || {};
    if (!siteUrl) return bad(res, 'Website URL is required');
    if (!accountId || !(await repo.getAccountMeta(req.workspace.id, accountId))) return bad(res, 'Pick a connected Instagram account');
    if (!TIME_RE.test(postTime)) return bad(res, 'Post time must be HH:MM (24-hour)');
    if (!isValidTimezone(timezone)) return bad(res, 'Invalid time zone');

    let store;
    try { store = await storefront.getStoreInfo(siteUrl); }
    catch (err) { return bad(res, err.message); }

    const row = await repo.createAutomation(req.workspace.id, req.user.id, {
      accountId, siteUrl: store.url, siteName: store.name, currency: store.currency,
      postTime, timezone, captionInstructions: captionInstructions?.trim(), hashtags: hashtags?.trim(),
    });
    res.status(201).json({ success: true, message: `Daily posts scheduled for ${store.name || store.url}`, data: row });
  } catch (error) { next(error); }
});

router.patch('/automations/:id', manage, async (req, res, next) => {
  try {
    const { accountId, postTime, timezone, captionInstructions, hashtags, status } = req.body || {};
    if (status !== undefined && !['active', 'paused'].includes(status)) return bad(res, 'status must be active or paused');
    if (postTime !== undefined && !TIME_RE.test(postTime)) return bad(res, 'Post time must be HH:MM (24-hour)');
    if (timezone !== undefined && !isValidTimezone(timezone)) return bad(res, 'Invalid time zone');
    if (accountId !== undefined && !(await repo.getAccountMeta(req.workspace.id, accountId))) return bad(res, 'Pick a connected Instagram account');

    const row = await repo.updateAutomation(req.workspace.id, req.params.id, {
      accountId, postTime, timezone, status,
      captionInstructions: captionInstructions?.trim(), hashtags: hashtags?.trim(),
    });
    if (!row) return bad(res, 'Automation not found', 404);
    res.json({ success: true, message: 'Saved', data: row });
  } catch (error) { next(error); }
});

router.delete('/automations/:id', manage, async (req, res, next) => {
  try {
    const ok = await repo.removeAutomation(req.workspace.id, req.params.id);
    if (!ok) return bad(res, 'Automation not found', 404);
    res.json({ success: true, message: 'Automation deleted' });
  } catch (error) { next(error); }
});

// Shows what would post next (product + DeepSeek caption) without publishing.
router.post('/automations/:id/preview', async (req, res, next) => {
  try {
    const automation = await repo.getAutomation(req.workspace.id, req.params.id);
    if (!automation) return bad(res, 'Automation not found', 404);
    try { res.json({ success: true, data: await previewAutomation(automation) }); }
    catch (err) { bad(res, err.message); }
  } catch (error) { next(error); }
});

// Publishes the next product right away. Doesn't move the daily schedule.
router.post('/automations/:id/post-now', manage, async (req, res, next) => {
  try {
    if (!(await repo.getAutomation(req.workspace.id, req.params.id))) return bad(res, 'Automation not found', 404);
    const automation = await repo.claimById(req.workspace.id, req.params.id);
    if (!automation) return bad(res, 'A post is already in progress for this website', 409);
    const post = await runAutomation(automation, 'manual');
    if (post.status !== 'published') return bad(res, post.error || 'Posting failed');
    res.json({ success: true, message: 'Posted to Instagram', data: post });
  } catch (error) { next(error); }
});

router.get('/automations/:id/posts', async (req, res, next) => {
  try { res.json({ success: true, data: await repo.listPosts(req.workspace.id, req.params.id) }); }
  catch (error) { next(error); }
});

export default router;
