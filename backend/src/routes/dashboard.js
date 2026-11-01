import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace } from '../middleware/workspace.js';
import * as dash from '../repositories/dashboard.js';
import * as stores from '../repositories/stores.js';
import * as dnaRepo from '../repositories/dna.js';
import { getCurrentUsage } from '../services/usage.js';

// GET /api/dashboard — one call for the whole analytics overview.
const router = Router();
router.use(requireAuth, requireWorkspace);

router.get('/', async (req, res, next) => {
  try {
    const w = req.workspace.id;
    const [
      store, dna, usage, articles, articleDaily, usageByMonth, campaigns, scheduled,
      instagram, instagramDaily, quality, topPosts, activity,
    ] = await Promise.all([
      stores.getStoreMeta(w),
      dnaRepo.getDna(w),
      getCurrentUsage(w),
      dash.articleTotals(w),
      dash.articleDaily(w),
      dash.usageByMonth(w),
      dash.campaignStats(w),
      dash.scheduledStats(w),
      dash.instagramTotals(w),
      dash.instagramDaily(w),
      dash.qualityGate(w),
      dash.topStudioPosts(w),
      dash.recentActivity(w),
    ]);
    res.json({
      success: true,
      data: {
        setup: {
          storeConnected: Boolean(store),
          storeUrl: store?.store_url || null,
          dnaReady: Boolean(dna),
          dnaProducts: dna?.analysis?.totalProducts || 0,
          dnaArticles: dna?.analysis?.totalArticles || 0,
          dnaNiche: dna?.analysis?.niche || null,
          instagramAccounts: instagram.accounts,
        },
        usage,
        articles: { ...articles, daily: articleDaily, byMonth: usageByMonth, campaigns, scheduled },
        instagram: { ...instagram, daily: instagramDaily, quality, topPosts },
        activity,
      },
    });
  } catch (error) { next(error); }
});

export default router;
