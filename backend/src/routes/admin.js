import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/index.js';
import { requireAuth, requireAdmin, requireSuperadmin } from '../middleware/auth.js';
import * as users from '../repositories/users.js';
import * as workspacesRepo from '../repositories/workspaces.js';
import * as activity from '../repositories/activity.js';
import * as upgrades from '../repositories/upgradeRequests.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function ensureCanManageTarget(req, res, targetId) {
  const target = await users.getById(targetId);
  if (!target) { res.status(404).json({ success: false, error: 'User not found' }); return null; }
  if (target.role !== 'user' && req.user.role !== 'superadmin') {
    res.status(403).json({ success: false, error: 'Only a superadmin can manage admin accounts' });
    return null;
  }
  return target;
}

// ─── Users ──────────────────────────────────────────────────
router.get('/users', async (req, res, next) => {
  try { res.json({ success: true, data: await users.listAll() }); }
  catch (error) { next(error); }
});

router.get('/users/:id', async (req, res, next) => {
  try {
    const detail = await users.getDetail(req.params.id);
    if (!detail) return res.status(404).json({ success: false, error: 'User not found' });
    const recentActivity = await activity.recentForUser(req.params.id, 30);
    res.json({ success: true, data: { ...detail, activity: recentActivity } });
  } catch (error) { next(error); }
});

router.post('/users', async (req, res, next) => {
  try {
    const { email, password, name, role } = req.body || {};
    if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ success: false, error: 'Valid email required' });
    if (!password || password.length < 8) return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    const wantedRole = role || 'user';
    if (!['user', 'admin', 'superadmin'].includes(wantedRole)) return res.status(400).json({ success: false, error: 'Invalid role' });
    if (wantedRole !== 'user' && req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, error: 'Only a superadmin can create admin accounts' });
    }
    if (await users.emailExists(email)) return res.status(409).json({ success: false, error: 'Email already in use' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await users.createUser({ email, passwordHash, name, role: wantedRole, status: 'active' });
    // Auto-create a personal workspace for the new user.
    const wsName = name ? `${name}'s Workspace` : `${email.split('@')[0]}'s Workspace`;
    await workspacesRepo.createForOwner(user.id, wsName);
    activity.log(req.user.id, 'admin_create_user', email);
    res.status(201).json({ success: true, data: user });
  } catch (error) { next(error); }
});

router.post('/users/:id/approve', async (req, res, next) => {
  try {
    const target = await ensureCanManageTarget(req, res, req.params.id);
    if (!target) return;
    await users.setStatus(target.id, 'active');
    activity.log(req.user.id, 'admin_approve_user', target.email);
    res.json({ success: true, message: 'User approved' });
  } catch (error) { next(error); }
});

router.post('/users/:id/suspend', async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ success: false, error: "You can't suspend yourself" });
    const target = await ensureCanManageTarget(req, res, req.params.id);
    if (!target) return;
    await users.setStatus(target.id, 'suspended');
    activity.log(req.user.id, 'admin_suspend_user', target.email);
    res.json({ success: true, message: 'User suspended' });
  } catch (error) { next(error); }
});

router.post('/users/:id/reactivate', async (req, res, next) => {
  try {
    const target = await ensureCanManageTarget(req, res, req.params.id);
    if (!target) return;
    await users.setStatus(target.id, 'active');
    activity.log(req.user.id, 'admin_reactivate_user', target.email);
    res.json({ success: true, message: 'User reactivated' });
  } catch (error) { next(error); }
});

router.post('/users/:id/role', requireSuperadmin, async (req, res, next) => {
  try {
    const { role } = req.body || {};
    if (!['user', 'admin', 'superadmin'].includes(role)) return res.status(400).json({ success: false, error: 'Invalid role' });
    const target = await users.getById(req.params.id);
    if (!target) return res.status(404).json({ success: false, error: 'User not found' });
    if (target.role === 'superadmin' && role !== 'superadmin') {
      const count = await users.countByRole('superadmin');
      if (count <= 1) return res.status(400).json({ success: false, error: 'Cannot demote the only superadmin' });
    }
    await users.setRole(target.id, role);
    activity.log(req.user.id, 'admin_set_role', `${target.email} → ${role}`);
    res.json({ success: true, message: 'Role updated' });
  } catch (error) { next(error); }
});

// ─── Workspaces (the billable tenant) ───────────────────────
router.get('/workspaces', async (req, res, next) => {
  try { res.json({ success: true, data: await workspacesRepo.listAllForAdmin() }); }
  catch (error) { next(error); }
});

router.post('/workspaces/:id/plan', async (req, res, next) => {
  try {
    const { planId } = req.body || {};
    if (!planId) return res.status(400).json({ success: false, error: 'planId is required' });
    const plan = await query('SELECT id FROM plans WHERE id = $1', [planId]);
    if (plan.rowCount === 0) return res.status(400).json({ success: false, error: 'Unknown plan' });
    const ws = await workspacesRepo.getById(req.params.id);
    if (!ws) return res.status(404).json({ success: false, error: 'Workspace not found' });
    await query(
      `INSERT INTO subscriptions (workspace_id, plan_id, current_period_start)
       VALUES ($1, $2, now())
       ON CONFLICT (workspace_id) DO UPDATE SET plan_id = $2, updated_at = now()`,
      [ws.id, planId]
    );
    activity.log(req.user.id, 'admin_set_plan', `${ws.name} → ${planId}`);
    res.json({ success: true, message: 'Plan updated' });
  } catch (error) { next(error); }
});

router.post('/workspaces/:id/suspend', async (req, res, next) => {
  try {
    const ws = await workspacesRepo.getById(req.params.id);
    if (!ws) return res.status(404).json({ success: false, error: 'Workspace not found' });
    await workspacesRepo.setStatus(ws.id, 'suspended');
    activity.log(req.user.id, 'admin_suspend_workspace', ws.name);
    res.json({ success: true, message: 'Workspace suspended' });
  } catch (error) { next(error); }
});

router.post('/workspaces/:id/reactivate', async (req, res, next) => {
  try {
    const ws = await workspacesRepo.getById(req.params.id);
    if (!ws) return res.status(404).json({ success: false, error: 'Workspace not found' });
    await workspacesRepo.setStatus(ws.id, 'active');
    activity.log(req.user.id, 'admin_reactivate_workspace', ws.name);
    res.json({ success: true, message: 'Workspace reactivated' });
  } catch (error) { next(error); }
});

// ─── Plans ──────────────────────────────────────────────────
router.get('/plans', async (req, res, next) => {
  try { const { rows } = await query('SELECT * FROM plans ORDER BY monthly_article_limit ASC'); res.json({ success: true, data: rows }); }
  catch (error) { next(error); }
});

// ─── Activity ───────────────────────────────────────────────
router.get('/activity', async (req, res, next) => {
  try { res.json({ success: true, data: await activity.recent(120) }); }
  catch (error) { next(error); }
});

// ─── Upgrade requests ───────────────────────────────────────
router.get('/upgrade-requests', async (req, res, next) => {
  try { res.json({ success: true, data: await upgrades.listPending() }); }
  catch (error) { next(error); }
});

router.post('/upgrade-requests/:id/approve', async (req, res, next) => {
  try {
    const r = await upgrades.getById(req.params.id);
    if (!r || r.status !== 'pending') return res.status(404).json({ success: false, error: 'Request not found or already handled' });
    await query(
      `INSERT INTO subscriptions (workspace_id, plan_id, current_period_start)
       VALUES ($1, $2, now())
       ON CONFLICT (workspace_id) DO UPDATE SET plan_id = $2, updated_at = now()`,
      [r.workspace_id, r.requested_plan]
    );
    await upgrades.resolve(r.id, 'approved', req.user.id);
    activity.log(req.user.id, 'admin_approve_upgrade', `${r.workspace_id} → ${r.requested_plan}`);
    res.json({ success: true, message: 'Upgrade approved' });
  } catch (error) { next(error); }
});

router.post('/upgrade-requests/:id/reject', async (req, res, next) => {
  try {
    const r = await upgrades.getById(req.params.id);
    if (!r || r.status !== 'pending') return res.status(404).json({ success: false, error: 'Request not found or already handled' });
    await upgrades.resolve(r.id, 'rejected', req.user.id);
    activity.log(req.user.id, 'admin_reject_upgrade', r.workspace_id);
    res.json({ success: true, message: 'Upgrade rejected' });
  } catch (error) { next(error); }
});

export default router;
