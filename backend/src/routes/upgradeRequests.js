import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import * as upgrades from '../repositories/upgradeRequests.js';
import * as activity from '../repositories/activity.js';

const router = Router();
router.use(requireAuth);

// Plans a user can request (for the upgrade UI)
router.get('/plans', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id, name, monthly_article_limit, price_inr FROM plans ORDER BY monthly_article_limit ASC');
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});

// This user's own requests
router.get('/mine', async (req, res, next) => {
  try {
    res.json({ success: true, data: await upgrades.listForUser(req.user.id) });
  } catch (error) { next(error); }
});

// Request an upgrade
router.post('/', async (req, res, next) => {
  try {
    const { requestedPlan, note } = req.body || {};
    if (!requestedPlan) return res.status(400).json({ success: false, error: 'requestedPlan is required' });
    const plan = await query('SELECT id FROM plans WHERE id = $1', [requestedPlan]);
    if (plan.rowCount === 0) return res.status(400).json({ success: false, error: 'Unknown plan' });

    const { row, created } = await upgrades.createOrGetPending(req.user.id, requestedPlan, note);
    if (created) activity.log(req.user.id, 'upgrade_request', requestedPlan);
    res.status(created ? 201 : 200).json({
      success: true,
      data: row,
      message: created ? 'Upgrade request submitted — an admin will review it.' : 'You already have a pending upgrade request.',
    });
  } catch (error) { next(error); }
});

export default router;
