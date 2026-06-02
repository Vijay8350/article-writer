import { Router } from 'express';
import { getShopInfo } from '../services/shopify.js';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace, requireWorkspaceRole } from '../middleware/workspace.js';
import * as stores from '../repositories/stores.js';
import * as aiKeys from '../repositories/aiKeys.js';
import { getCurrentUsage } from '../services/usage.js';

const router = Router();
router.use(requireAuth, requireWorkspace);

// Current workspace's plan + usage
router.get('/usage', async (req, res, next) => {
  try {
    res.json({ success: true, data: await getCurrentUsage(req.workspace.id) });
  } catch (error) { next(error); }
});

router.get('/', async (req, res, next) => {
  try {
    const meta = await stores.getStoreMeta(req.workspace.id);
    const keys = await aiKeys.getKeyPresence(req.workspace.id);
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
  } catch (error) { next(error); }
});

// Connect / disconnect / save-keys mutate workspace state → admin or owner only.
router.post('/connect', requireWorkspaceRole('owner', 'admin'), async (req, res) => {
  try {
    const { storeUrl, accessToken } = req.body || {};
    if (!storeUrl || !accessToken) {
      return res.status(400).json({ success: false, error: 'Store URL and access token are required' });
    }
    const cleanUrl = storeUrl.trim().replace(/\/$/, '').replace(/^https?:\/\//, '');
    const shop = await getShopInfo({ storeUrl: cleanUrl, accessToken });
    await stores.upsertStore(req.workspace.id, cleanUrl, accessToken, shop.name);
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

router.post('/disconnect', requireWorkspaceRole('owner', 'admin'), async (req, res, next) => {
  try {
    await stores.deleteStores(req.workspace.id);
    res.json({ success: true, message: 'Disconnected' });
  } catch (error) { next(error); }
});

router.post('/ai-keys', requireWorkspaceRole('owner', 'admin'), async (req, res, next) => {
  try {
    const { geminiKey, deepseekKey } = req.body || {};
    await aiKeys.saveKeys(req.workspace.id, {
      geminiKey: geminiKey ? geminiKey.trim() : undefined,
      deepseekKey: deepseekKey ? deepseekKey.trim() : undefined,
    });
    const presence = await aiKeys.getKeyPresence(req.workspace.id);
    res.json({ success: true, message: 'AI keys saved', data: presence });
  } catch (error) { next(error); }
});

export default router;
