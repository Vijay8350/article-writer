import { Router } from 'express';
import { getShopInfo } from '../services/shopify.js';
import { requireAuth } from '../middleware/auth.js';
import * as stores from '../repositories/stores.js';
import * as aiKeys from '../repositories/aiKeys.js';
import { getCurrentUsage } from '../services/usage.js';

const router = Router();

// All settings routes require a logged-in user.
router.use(requireAuth);

// Current plan + monthly usage for the logged-in user
router.get('/usage', async (req, res, next) => {
  try {
    const usage = await getCurrentUsage(req.user.id);
    res.json({ success: true, data: usage });
  } catch (error) {
    next(error);
  }
});

// Get current user's store + AI key presence
router.get('/', async (req, res, next) => {
  try {
    const meta = await stores.getStoreMeta(req.user.id);
    const keys = await aiKeys.getKeyPresence(req.user.id);
    res.json({
      success: true,
      data: {
        storeUrl: meta?.store_url || '',
        shopName: meta?.shop_name || '',
        connected: !!meta,
        hasAccessToken: !!meta,
        aiKeys: keys,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Test & save Shopify connection for this user
router.post('/connect', async (req, res, next) => {
  try {
    const { storeUrl, accessToken } = req.body || {};
    if (!storeUrl || !accessToken) {
      return res.status(400).json({ success: false, error: 'Store URL and access token are required' });
    }

    const cleanUrl = storeUrl.trim().replace(/\/$/, '').replace(/^https?:\/\//, '');

    // Validate the credentials by hitting Shopify before persisting.
    const shop = await getShopInfo({ storeUrl: cleanUrl, accessToken });

    await stores.upsertStore(req.user.id, cleanUrl, accessToken, shop.name);

    res.json({
      success: true,
      message: 'Connected successfully!',
      data: {
        shop: { name: shop.name, domain: shop.domain, email: shop.email, country: shop.country_name },
      },
    });
  } catch (error) {
    const msg = error.response?.status === 401 ? 'Invalid access token' :
      error.response?.status === 404 ? 'Store not found' :
        error.code === 'ENOTFOUND' ? 'Store URL not found' :
          `Connection failed: ${error.message}`;
    res.status(400).json({ success: false, error: msg });
  }
});

// Disconnect this user's store
router.post('/disconnect', async (req, res, next) => {
  try {
    await stores.deleteStores(req.user.id);
    res.json({ success: true, message: 'Disconnected' });
  } catch (error) {
    next(error);
  }
});

// Save optional per-user AI keys (only non-empty values are stored)
router.post('/ai-keys', async (req, res, next) => {
  try {
    const { geminiKey, deepseekKey } = req.body || {};
    await aiKeys.saveKeys(req.user.id, {
      geminiKey: geminiKey ? geminiKey.trim() : undefined,
      deepseekKey: deepseekKey ? deepseekKey.trim() : undefined,
    });
    const presence = await aiKeys.getKeyPresence(req.user.id);
    res.json({ success: true, message: 'AI keys saved', data: presence });
  } catch (error) {
    next(error);
  }
});

export default router;
