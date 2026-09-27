import { Router } from 'express';
import { getShopInfo } from '../services/shopify.js';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace, requireWorkspaceRole } from '../middleware/workspace.js';
import * as stores from '../repositories/stores.js';
import * as aiKeys from '../repositories/aiKeys.js';
import { getCurrentUsage } from '../services/usage.js';
import * as gemini from '../services/gemini.js';
import * as deepseek from '../services/deepseek.js';
import * as ai from '../services/ai.js';
import config from '../config/env.js';

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
    const [meta, keys, aiSettings] = await Promise.all([
      stores.getStoreMeta(req.workspace.id),
      aiKeys.getKeyPresence(req.workspace.id),
      aiKeys.getSettings(req.workspace.id),
    ]);
    res.json({
      success: true,
      data: {
        storeUrl: meta?.store_url || '',
        shopName: meta?.shop_name || '',
        connected: !!meta,
        hasAccessToken: !!meta,
        aiKeys: keys,
        ai: ai.withDefaults(aiSettings),
        // Whether a shared platform key exists to fall back on (never the key itself).
        platformKeys: { gemini: !!config.gemini.apiKey, deepseek: !!config.deepseek.apiKey },
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
    const geminiKey = req.body?.geminiKey?.trim() || undefined;
    const deepseekKey = req.body?.deepseekKey?.trim() || undefined;
    // Reject keys the provider refuses, so a bad key fails here instead of at generation time.
    try {
      if (geminiKey) await gemini.verifyKey(geminiKey);
      if (deepseekKey) await deepseek.verifyKey(deepseekKey);
    } catch (error) {
      return res.status(400).json({ success: false, error: error.message });
    }
    await aiKeys.saveKeys(req.workspace.id, { geminiKey, deepseekKey });
    const presence = await aiKeys.getKeyPresence(req.workspace.id);
    res.json({ success: true, message: 'AI keys saved', data: presence });
  } catch (error) { next(error); }
});

// Remove the workspace's own key → that provider falls back to the platform key.
router.delete('/ai-keys/:provider', requireWorkspaceRole('owner', 'admin'), async (req, res, next) => {
  try {
    if (!ai.PROVIDERS.includes(req.params.provider)) {
      return res.status(400).json({ success: false, error: 'Unknown AI provider' });
    }
    await aiKeys.clearKey(req.workspace.id, req.params.provider);
    res.json({ success: true, message: 'Key removed', data: await aiKeys.getKeyPresence(req.workspace.id) });
  } catch (error) { next(error); }
});

// Which provider each task uses + the DeepSeek model.
router.put('/ai-preferences', requireWorkspaceRole('owner', 'admin'), async (req, res, next) => {
  try {
    const settings = ai.normalizeSettings(req.body || {});
    await aiKeys.saveSettings(req.workspace.id, settings);
    res.json({ success: true, message: 'AI preferences saved', data: ai.withDefaults(settings) });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ success: false, error: error.message });
    next(error);
  }
});

// Live check of the DeepSeek key this workspace would use, returning the models it can call.
router.get('/deepseek-models', async (req, res, next) => {
  try {
    const { deepseekKey } = await aiKeys.getKeys(req.workspace.id);
    if (!deepseekKey && !config.deepseek.apiKey) {
      return res.status(400).json({ success: false, error: 'No DeepSeek API key yet — add one above first.' });
    }
    try {
      const models = await deepseek.verifyKey(deepseekKey || undefined);
      res.json({ success: true, data: { models, keySource: deepseekKey ? 'workspace' : 'platform' } });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  } catch (error) { next(error); }
});

export default router;
