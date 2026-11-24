import { Router } from 'express';
import * as plansRepo from '../repositories/plans.js';
import { FEATURES, LIMITS, publicPlan } from '../lib/planFeatures.js';

// Public: the plans on offer, for the pricing section of the home page. No sign-in.
const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const data = (await plansRepo.list()).filter((p) => p.is_active !== false).map(publicPlan);
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ success: true, data, catalogue: { features: FEATURES, limits: LIMITS } });
  } catch (error) { next(error); }
});

export default router;
