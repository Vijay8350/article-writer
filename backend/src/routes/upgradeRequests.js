import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace, requireWorkspaceRole } from '../middleware/workspace.js';
import * as upgrades from '../repositories/upgradeRequests.js';
import * as activity from '../repositories/activity.js';
import * as plansRepo from '../repositories/plans.js';
import { FEATURES, LIMITS, publicPlan } from '../lib/planFeatures.js';

const router = Router();
router.use(requireAuth, requireWorkspace);

// The plans on offer, each with what it includes, and the names of every feature and limit.
router.get('/plans', async (req, res, next) => {
  try {
    const rows = (await plansRepo.list()).filter((p) => p.is_active !== false);
    const data = rows.map(publicPlan);
    res.json({ success: true, data, catalogue: { features: FEATURES, limits: LIMITS } });
  } catch (error) { next(error); }
});

router.get('/mine', async (req, res, next) => {
  try { res.json({ success: true, data: await upgrades.listForWorkspace(req.workspace.id) }); }
  catch (error) { next(error); }
});

// Only owner/admin in a workspace may request an upgrade (billing decision).
router.post('/', requireWorkspaceRole('owner', 'admin'), async (req, res, next) => {
  try {
    const { requestedPlan, note } = req.body || {};
    if (!requestedPlan) return res.status(400).json({ success: false, error: 'requestedPlan is required' });
    const plan = await plansRepo.getById(String(requestedPlan));
    if (!plan || plan.is_active === false) return res.status(400).json({ success: false, error: 'That plan is not offered' });

    const { row, created } = await upgrades.createOrGetPending(req.workspace.id, req.user.id, requestedPlan, note);
    if (created) activity.log(req.user.id, 'upgrade_request', `${req.workspace.id} → ${requestedPlan}`);
    res.status(created ? 201 : 200).json({
      success: true,
      data: row,
      message: created ? 'Upgrade request submitted — an admin will review it.' : 'You already have a pending upgrade request.',
    });
  } catch (error) { next(error); }
});

export default router;
