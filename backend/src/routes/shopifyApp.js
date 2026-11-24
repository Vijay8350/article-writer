import { Router } from 'express';
import config from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace, requireWorkspaceRole } from '../middleware/workspace.js';
import { rateLimit } from '../lib/rateLimit.js';
import * as shopifyApp from '../services/shopifyApp.js';
import * as activity from '../repositories/activity.js';

// /api/shopify — the public Shopify app. Public routes are verified by Shopify's own
// signatures (OAuth HMAC + signed state, session tokens); the rest use our sign-in.
const router = Router();
const manage = requireWorkspaceRole('owner', 'admin');
const sessionLimit = rateLimit({ windowMs: 60 * 1000, max: 60, message: 'Too many requests. Wait a moment and reload the app.' });

const send = (res, err, next) => {
  if (err.status && err.status < 500) {
    if (err.retrySession) res.set('X-Shopify-Retry-Invalid-Session-Request', '1');
    return res.status(err.status).json({ success: false, error: err.message, ...(err.code ? { code: err.code } : {}) });
  }
  if (err.status) return res.status(err.status).json({ success: false, error: err.message });
  return next(err);
};

// Whether this server has the Shopify app's credentials (the website shows the button only then).
router.get('/status', (req, res) => {
  res.json({ success: true, data: { configured: shopifyApp.isConfigured(), apiKey: config.shopify.clientId || null } });
});

// Website: start "Connect with Shopify" for the active workspace → Shopify's approval page.
router.post('/connect', requireAuth, requireWorkspace, manage, async (req, res, next) => {
  try {
    const url = await shopifyApp.connectUrl({ workspaceId: req.workspace.id, userId: req.user.id, shopInput: req.body?.shop });
    res.json({ success: true, data: { url } });
  } catch (err) { send(res, err, next); }
});

// Shopify's redirect after the merchant approves (public; HMAC + signed state checked).
router.get('/callback', async (req, res) => {
  const back = `${config.publicBaseUrl}/settings`;
  try {
    const { shop } = await shopifyApp.handleCallback(req.query);
    res.redirect(`${back}?shopify=connected&shop=${encodeURIComponent(shop)}`);
  } catch (err) {
    console.warn(`⚠️ Shopify connect failed: ${err.message}`);
    res.redirect(`${back}?shopify_error=${encodeURIComponent(err.status && err.status < 500 ? err.message : 'Connecting to Shopify failed. Try again.')}`);
  }
});

// Inside the Shopify admin: session token (Authorization: Bearer …) → our session.
router.post('/session', sessionLimit, async (req, res, next) => {
  try {
    const header = String(req.get('authorization') || '');
    const idToken = header.startsWith('Bearer ') ? header.slice(7) : String(req.body?.idToken || '');
    if (!idToken) return res.status(401).set('X-Shopify-Retry-Invalid-Session-Request', '1').json({ success: false, error: 'Missing Shopify session' });
    const data = await shopifyApp.embeddedSession(idToken);
    res.json({ success: true, data });
  } catch (err) { send(res, err, next); }
});

// Shopify Billing (stores connected through the app).
router.get('/billing', requireAuth, requireWorkspace, async (req, res, next) => {
  try { res.json({ success: true, data: await shopifyApp.billingInfo(req.workspace.id) }); }
  catch (err) { send(res, err, next); }
});

router.post('/billing/subscribe', requireAuth, requireWorkspace, manage, async (req, res, next) => {
  try {
    const data = await shopifyApp.subscribe(req.workspace.id, req.body?.planId);
    activity.log(req.user.id, 'shopify_billing', `${req.workspace.id} → ${req.body?.planId}`);
    res.json({ success: true, data, ...(data.message ? { message: data.message } : {}) });
  } catch (err) { send(res, err, next); }
});

router.post('/billing/sync', requireAuth, requireWorkspace, async (req, res, next) => {
  try { res.json({ success: true, data: await shopifyApp.syncBilling(req.workspace.id) }); }
  catch (err) { send(res, err, next); }
});

export default router;
