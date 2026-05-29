import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const PERIOD = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// List all users with plan + current-month usage
router.get('/users', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.email, u.name, u.role, u.created_at,
              COALESCE(s.plan_id, 'free') AS plan_id,
              p.monthly_article_limit,
              COALESCE(uc.articles_generated, 0) AS used
         FROM users u
         LEFT JOIN subscriptions s ON s.user_id = u.id
         LEFT JOIN plans p ON p.id = COALESCE(s.plan_id, 'free')
         LEFT JOIN usage_counters uc ON uc.user_id = u.id AND uc.period = $1
        ORDER BY u.created_at DESC`,
      [PERIOD()]
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

// List available plans
router.get('/plans', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM plans ORDER BY monthly_article_limit ASC');
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

// Manually set a user's plan
router.post('/users/:id/plan', async (req, res, next) => {
  try {
    const { planId } = req.body || {};
    if (!planId) return res.status(400).json({ success: false, error: 'planId is required' });

    const plan = await query('SELECT id FROM plans WHERE id = $1', [planId]);
    if (plan.rowCount === 0) return res.status(400).json({ success: false, error: 'Unknown plan' });

    await query(
      `INSERT INTO subscriptions (user_id, plan_id, current_period_start)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET plan_id = $2, updated_at = now()`,
      [req.params.id, planId]
    );
    res.json({ success: true, message: 'Plan updated' });
  } catch (error) {
    next(error);
  }
});

export default router;
