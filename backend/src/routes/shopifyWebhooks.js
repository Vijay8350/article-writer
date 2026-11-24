import { Router } from 'express';
import config from '../config/env.js';
import { verifyWebhookHmac, normalizeShop } from '../lib/shopifyAuth.js';
import * as shopifyApp from '../services/shopifyApp.js';
import * as repo from '../repositories/shopifyApp.js';

// POST /api/shopify/webhooks — every topic the app subscribes to in shopify.app.toml,
// including the three mandatory privacy topics. Mounted with express.raw() so the
// HMAC is checked on the exact bytes Shopify sent; a bad or missing HMAC gets 401.
const router = Router();

router.post('/', async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  if (!verifyWebhookHmac(raw, req.get('x-shopify-hmac-sha256'), config.shopify.clientSecret)) {
    return res.status(401).send('Invalid HMAC');
  }
  const topic = String(req.get('x-shopify-topic') || '');
  const shop = normalizeShop(req.get('x-shopify-shop-domain'));
  const eventId = req.get('x-shopify-event-id') || req.get('x-shopify-webhook-id') || null;
  let payload = {};
  try { payload = JSON.parse(raw.toString('utf8') || '{}'); } catch { /* keep {} */ }

  // Answer at once; Shopify retries anything slower than a few seconds.
  res.status(200).send('ok');

  try {
    if (eventId && !(await repo.recordWebhook(eventId, topic, shop))) return; // seen before
    const result = await shopifyApp.handleWebhook({ topic, shop, payload });
    console.log(`🛍️ Shopify webhook ${topic} for ${shop}: ${JSON.stringify(result)}`);
  } catch (err) {
    console.error(`❌ Shopify webhook ${topic} for ${shop} failed: ${err.message}`);
  }
});

export default router;
