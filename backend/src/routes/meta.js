import express, { Router } from 'express';
import { randomBytes } from 'crypto';
import config from '../config/env.js';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace, requireWorkspaceRole } from '../middleware/workspace.js';
import * as fb from '../services/facebookLogin.js';
import * as igRepo from '../repositories/instagram.js';
import * as repo from '../repositories/igStudio.js';

// Meta endpoints (/api/meta): "Connect with Facebook" OAuth and the Facebook
// data-deletion callback. The callback routes are public — Meta calls them —
// so they authenticate with a signed OAuth state / signed_request instead of a JWT.

const router = Router();
const NONCE_COOKIE = 'ig_oauth_nonce';
const cookieOpts = `Path=/api/meta; HttpOnly; SameSite=Lax; Max-Age=600${config.nodeEnv === 'production' ? '; Secure' : ''}`;

const readCookie = (req, name) => {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
};

// Back to the Accounts page with a result the page shows as a toast.
function backToApp(res, params) {
  const dest = new URL('/instagram', config.frontendUrl);
  for (const [k, v] of Object.entries(params)) dest.searchParams.set(k, String(v).slice(0, 160));
  res.setHeader('Set-Cookie', `${NONCE_COOKIE}=; Path=/api/meta; Max-Age=0`);
  res.redirect(dest.toString());
}

// Step 1 (signed-in owner/admin): the Facebook dialog URL the browser goes to next.
router.post('/oauth/start', requireAuth, requireWorkspace, requireWorkspaceRole('owner', 'admin'), (req, res) => {
  if (!fb.isConfigured()) {
    return res.status(400).json({ success: false, error: 'Facebook Login is not set up: add FACEBOOK_APP_ID and FACEBOOK_APP_SECRET to the server .env.' });
  }
  const { state, nonce } = fb.createState({ workspaceId: req.workspace.id, userId: req.user.id });
  res.setHeader('Set-Cookie', `${NONCE_COOKIE}=${nonce}; ${cookieOpts}`);
  res.json({ success: true, data: { url: fb.dialogUrl(state), redirectUri: fb.redirectUri() } });
});

// Step 2 (Facebook redirects here): store every Instagram Business account linked to the user's Pages.
router.get('/oauth/callback', async (req, res) => {
  const { code, state } = req.query;
  const oauthError = req.query.error_description || req.query.error;
  if (oauthError) return backToApp(res, { ig_error: oauthError });

  const who = fb.verifyState(state, readCookie(req, NONCE_COOKIE));
  if (!code || !who) return backToApp(res, { ig_error: 'The connection link expired or was opened in another browser — try again.' });

  try {
    // Still an owner/admin of that workspace (and the workspace is active)?
    const { rows } = await query(
      `SELECT 1 FROM memberships m JOIN workspaces w ON w.id = m.workspace_id JOIN users u ON u.id = m.user_id
        WHERE m.workspace_id = $1 AND m.user_id = $2 AND m.role IN ('owner', 'admin')
          AND w.status <> 'suspended' AND u.status = 'active'`,
      [who.workspaceId, who.userId]
    );
    if (!rows.length) return backToApp(res, { ig_error: 'You no longer have permission to connect accounts to this workspace.' });

    const pages = await fb.pagesWithInstagram(await fb.exchangeCode(String(code)));
    const eligible = pages.filter((p) => p.instagram);
    if (!pages.length) return backToApp(res, { ig_error: 'No Facebook Pages were shared. Reconnect and select the Page linked to your Instagram account.' });
    if (!eligible.length) return backToApp(res, { ig_error: 'None of the shared Pages has an Instagram Business or Creator account linked.' });

    const names = [];
    for (const page of eligible) {
      await igRepo.upsertAccount(who.workspaceId, who.userId, {
        igUserId: page.instagram.id,
        username: page.instagram.username,
        tokenType: 'facebook',
        accessToken: page.pageAccessToken,
        tokenExpiresAt: null, // Page tokens from a long-lived user token don't expire
        pageId: page.pageId,
        connectedVia: 'facebook_login',
      });
      names.push(`@${page.instagram.username}`);
    }
    backToApp(res, { ig_connected: names.join(', ') });
  } catch (err) {
    console.error('[meta] OAuth callback failed:', err.message);
    backToApp(res, { ig_error: `Facebook Login failed: ${err.message}` });
  }
});

// Facebook data-deletion callback. GET is a reachability check (Meta's URL validator).
router.get('/data-deletion', (req, res) => {
  res.json({ status: 'ok', endpoint: 'facebook_data_deletion_callback', info: `POST a signed_request here; status page: ${config.publicBaseUrl}/data-deletion` });
});

router.post('/data-deletion', express.urlencoded({ extended: false, limit: '20kb' }), async (req, res) => {
  if (!config.facebook.appSecret) return res.status(500).json({ error: 'data deletion not configured' });
  const signed = req.body?.signed_request;
  if (!signed) return res.status(400).json({ error: 'missing signed_request' });
  const data = fb.parseSignedRequest(signed);
  if (!data) return res.status(400).json({ error: 'invalid signed_request' });

  const confirmationCode = randomBytes(8).toString('hex');
  await repo.log({
    stage: 'data_deletion',
    message: 'Facebook data deletion request received',
    context: { fb_user_id: data.user_id ?? null, confirmation_code: confirmationCode },
  });
  res.json({ url: `${config.publicBaseUrl}/data-deletion?id=${confirmationCode}`, confirmation_code: confirmationCode });
});

// Status lookup for the public /data-deletion page.
router.get('/data-deletion/:code', async (req, res, next) => {
  try {
    const code = String(req.params.code);
    const found = /^[a-f0-9]{16}$/.test(code) ? await repo.findDeletionRequest(code) : null;
    res.json({ success: true, data: found ? { found: true, receivedAt: found.created_at } : { found: false } });
  } catch (err) { next(err); }
});

export default router;
