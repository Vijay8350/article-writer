import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../db/index.js';
import { requireAuth, requireAdmin, requireSuperadmin } from '../middleware/auth.js';
import * as users from '../repositories/users.js';
import * as workspacesRepo from '../repositories/workspaces.js';
import * as memberships from '../repositories/memberships.js';
import * as activity from '../repositories/activity.js';
import * as upgrades from '../repositories/upgradeRequests.js';
import * as adminStats from '../repositories/adminStats.js';
import * as plansRepo from '../repositories/plans.js';
import { FEATURES, LIMITS, effectivePlan, planFeaturesFrom, meteredFrom, overridesFrom } from '../lib/planFeatures.js';
import config from '../config/env.js';
import * as media from '../services/igMedia.js';
import * as openaiImages from '../services/openaiImages.js';
import * as codexLogin from '../services/codexLogin.js';

// The vendor console. Admins manage ordinary users (role "user"); only a superadmin can
// manage admin and superadmin accounts or change platform roles.

const router = Router();
router.use(requireAuth, requireAdmin);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WORKSPACE_ROLES = ['owner', 'admin', 'member'];
const MIN_PASSWORD = 8;

const notFound = (res) => res.status(404).json({ success: false, error: 'Not found' });
router.param('id', (req, res, next, id) => (UUID_RE.test(id) ? next() : notFound(res)));
router.param('workspaceId', (req, res, next, id) => (UUID_RE.test(id) ? next() : notFound(res)));
router.param('planId', (req, res, next, id) => (/^[a-z0-9][a-z0-9-]{0,30}$/.test(id) ? next() : notFound(res)));

// 14 characters with no look-alikes (0/O, 1/l), so it can be read out or typed from a screenshot.
function generatePassword() {
  const alpha = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(14), (b) => alpha[b % alpha.length]).join('');
}

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
// The console's overview: sign-ups, activity, plans and usage.
router.get('/overview', async (req, res, next) => {
  try { res.json({ success: true, data: await adminStats.overview() }); }
  catch (error) { next(error); }
});

// Every account with its workspaces, plans and this month's usage.
router.get('/customers', async (req, res, next) => {
  try { res.json({ success: true, data: await adminStats.customers() }); }
  catch (error) { next(error); }
});

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

// Creates an active account. It joins `workspaceId` with `workspaceRole` when given;
// otherwise it gets a personal workspace of its own.
router.post('/users', async (req, res, next) => {
  try {
    const { password, name, role, workspaceId, workspaceRole } = req.body || {};
    const email = String(req.body?.email || '').trim();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ success: false, error: 'Valid email required' });
    if (!password || password.length < MIN_PASSWORD) return res.status(400).json({ success: false, error: `Password must be at least ${MIN_PASSWORD} characters` });
    const wantedRole = role || 'user';
    if (!['user', 'admin', 'superadmin'].includes(wantedRole)) return res.status(400).json({ success: false, error: 'Invalid role' });
    if (wantedRole !== 'user' && req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, error: 'Only a superadmin can create admin accounts' });
    }
    if (workspaceId) {
      if (!UUID_RE.test(workspaceId) || !(await workspacesRepo.getById(workspaceId))) return res.status(400).json({ success: false, error: 'That workspace no longer exists' });
      if (!WORKSPACE_ROLES.includes(workspaceRole || 'member')) return res.status(400).json({ success: false, error: 'Invalid workspace role' });
    }
    if (await users.emailExists(email)) return res.status(409).json({ success: false, error: 'Email already in use' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await users.createUser({ email, passwordHash, name, role: wantedRole, status: 'active' });
    if (workspaceId) {
      await memberships.add(workspaceId, user.id, workspaceRole || 'member');
      await workspacesRepo.syncOwner(workspaceId);
    } else {
      const wsName = name ? `${name}'s Workspace` : `${email.split('@')[0]}'s Workspace`;
      await workspacesRepo.createForOwner(user.id, wsName);
    }
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

// Sets a user's password. With none given, a strong one is generated and returned once for
// the admin to hand over (there's no email); the user can change it later under Account.
router.post('/users/:id/password', async (req, res, next) => {
  try {
    const target = await ensureCanManageTarget(req, res, req.params.id);
    if (!target) return;
    const chosen = req.body?.password;
    if (chosen !== undefined && chosen !== '' && (typeof chosen !== 'string' || chosen.length < MIN_PASSWORD)) {
      return res.status(400).json({ success: false, error: `Password must be at least ${MIN_PASSWORD} characters` });
    }
    const password = chosen || generatePassword();
    await users.updatePasswordHash(target.id, await bcrypt.hash(password, 10));
    activity.log(req.user.id, 'admin_set_password', target.email); // never the password itself
    res.json({
      success: true,
      message: `Password changed for ${target.email}`,
      data: { email: target.email, generatedPassword: chosen ? undefined : password },
    });
  } catch (error) { next(error); }
});

// ─── A user's workspaces ────────────────────────────────────
// A workspace always keeps at least one owner, and a user always keeps at least one
// workspace (suspend the account instead of leaving it with nowhere to work).

router.post('/users/:id/workspaces', async (req, res, next) => {
  try {
    const target = await ensureCanManageTarget(req, res, req.params.id);
    if (!target) return;
    const { workspaceId, role = 'member' } = req.body || {};
    if (!WORKSPACE_ROLES.includes(role)) return res.status(400).json({ success: false, error: 'Invalid workspace role' });
    const ws = UUID_RE.test(workspaceId || '') ? await workspacesRepo.getById(workspaceId) : null;
    if (!ws) return res.status(404).json({ success: false, error: 'Workspace not found' });
    if (await memberships.get(ws.id, target.id)) return res.status(409).json({ success: false, error: 'Already in this workspace. Change their role instead.' });
    await memberships.add(ws.id, target.id, role);
    await workspacesRepo.syncOwner(ws.id);
    activity.log(req.user.id, 'admin_add_to_workspace', `${target.email} → ${ws.name} (${role})`);
    res.json({ success: true, message: `Added to ${ws.name} as ${role}` });
  } catch (error) { next(error); }
});

router.patch('/users/:id/workspaces/:workspaceId', async (req, res, next) => {
  try {
    const target = await ensureCanManageTarget(req, res, req.params.id);
    if (!target) return;
    const { role } = req.body || {};
    if (!WORKSPACE_ROLES.includes(role)) return res.status(400).json({ success: false, error: 'Invalid workspace role' });
    const current = await memberships.get(req.params.workspaceId, target.id);
    if (!current) return res.status(404).json({ success: false, error: 'Not a member of that workspace' });
    if (current.role === 'owner' && role !== 'owner' && (await memberships.countByRole(req.params.workspaceId, 'owner')) <= 1) {
      return res.status(400).json({ success: false, error: "They're this workspace's only owner. Make someone else owner first." });
    }
    await memberships.setRole(req.params.workspaceId, target.id, role);
    await workspacesRepo.syncOwner(req.params.workspaceId);
    activity.log(req.user.id, 'admin_set_workspace_role', `${target.email} → ${role}`);
    res.json({ success: true, message: `Role changed to ${role}` });
  } catch (error) { next(error); }
});

router.delete('/users/:id/workspaces/:workspaceId', async (req, res, next) => {
  try {
    const target = await ensureCanManageTarget(req, res, req.params.id);
    if (!target) return;
    const current = await memberships.get(req.params.workspaceId, target.id);
    if (!current) return res.status(404).json({ success: false, error: 'Not a member of that workspace' });
    if (current.role === 'owner' && (await memberships.countByRole(req.params.workspaceId, 'owner')) <= 1) {
      return res.status(400).json({ success: false, error: "They're this workspace's only owner. Make someone else owner first." });
    }
    if ((await workspacesRepo.listForUser(target.id)).length <= 1) {
      return res.status(400).json({ success: false, error: "This is their only workspace. Add them to another one first, or suspend the account." });
    }
    await memberships.remove(req.params.workspaceId, target.id);
    await workspacesRepo.syncOwner(req.params.workspaceId);
    activity.log(req.user.id, 'admin_remove_from_workspace', target.email);
    res.json({ success: true, message: 'Removed from the workspace' });
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
// Plans with what each includes (features on/off, limits) and how many workspaces use it,
// plus the catalogue of features and limits the editor shows.
router.get('/plans', async (req, res, next) => {
  try {
    const rows = await plansRepo.list();
    const data = await Promise.all(rows.map(async (p) => ({ ...p, ...effectivePlan(p), workspaces: await plansRepo.workspaceCount(p.id) })));
    res.json({ success: true, data, catalogue: { features: FEATURES, limits: LIMITS } });
  } catch (error) { next(error); }
});

const PLAN_ID_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;
const planError = (res, error) => res.status(error.status || 400).json({ success: false, error: error.message });
// The plan fields an editor sends → repository fields (throws 400 on a bad value).
function planFields(body = {}) {
  const out = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 40);
    if (!name) throw Object.assign(new Error('The plan needs a name'), { status: 400 });
    out.name = name;
  }
  if (body.price_inr !== undefined) {
    const price = Number(body.price_inr);
    if (!Number.isInteger(price) || price < 0 || price > 10_000_000) throw Object.assign(new Error('Price must be a whole number of rupees'), { status: 400 });
    out.priceInr = price;
  }
  // The price Shopify Billing charges stores outside India (USD, two decimals; blank = not sold through Shopify).
  if (body.price_usd !== undefined) {
    if (body.price_usd === null || body.price_usd === '') out.priceUsd = null;
    else {
      const usd = Math.round(Number(body.price_usd) * 100) / 100;
      if (!Number.isFinite(usd) || usd < 0 || usd > 100000) throw Object.assign(new Error('USD price must be a number like 12 or 12.99'), { status: 400 });
      out.priceUsd = usd;
    }
  }
  if (body.description !== undefined) out.description = String(body.description || '').trim().slice(0, 300) || null;
  if (body.is_active !== undefined) out.isActive = Boolean(body.is_active);
  const metered = meteredFrom(body);
  if (metered.monthly_article_limit !== undefined) out.monthlyArticleLimit = metered.monthly_article_limit;
  if (metered.monthly_ig_post_limit !== undefined) out.monthlyIgPostLimit = metered.monthly_ig_post_limit;
  if (body.features !== undefined || body.limits !== undefined) out.features = planFeaturesFrom(body);
  return out;
}

// Edit a plan, feature by feature (applies to every workspace on it). Superadmin only.
router.put('/plans/:planId', requireSuperadmin, async (req, res, next) => {
  try {
    const plan = await plansRepo.getById(req.params.planId);
    if (!plan) return notFound(res);
    let fields;
    try { fields = planFields(req.body); } catch (err) { return planError(res, err); }
    // A part the editor didn't send (switches or extra limits) stays as it was.
    if (fields.features) {
      if (req.body.features === undefined) fields.features.features = plan.features?.features || {};
      if (req.body.limits === undefined) fields.features.limits = plan.features?.limits || {};
    }
    if (fields.isActive === false && plan.id === 'free') return res.status(400).json({ success: false, error: 'The Free plan is what new sign-ups get, so it stays on.' });
    const updated = await plansRepo.update(plan.id, fields);
    activity.log(req.user.id, 'admin_edit_plan', plan.id);
    res.json({ success: true, data: { ...updated, ...effectivePlan(updated) }, message: 'Plan saved' });
  } catch (error) { next(error); }
});

// A new plan (starts with every feature on; edit it after). Superadmin only.
router.post('/plans', requireSuperadmin, async (req, res, next) => {
  try {
    const id = String(req.body?.id || '').trim().toLowerCase();
    if (!PLAN_ID_RE.test(id)) return res.status(400).json({ success: false, error: 'Plan id: 2-31 lowercase letters, digits or dashes (e.g. "starter")' });
    if (await plansRepo.getById(id)) return res.status(409).json({ success: false, error: 'A plan with that id already exists' });
    let fields;
    try { fields = planFields({ ...req.body, limits: { monthly_article_limit: 10, monthly_ig_post_limit: 20, ...(req.body?.limits || {}) } }); }
    catch (err) { return planError(res, err); }
    if (!fields.name) return res.status(400).json({ success: false, error: 'The plan needs a name' });
    const created = await plansRepo.create({
      id, name: fields.name, priceInr: fields.priceInr ?? 0, description: fields.description,
      monthlyArticleLimit: fields.monthlyArticleLimit, monthlyIgPostLimit: fields.monthlyIgPostLimit, features: fields.features || { features: {}, limits: {} },
    });
    activity.log(req.user.id, 'admin_create_plan', id);
    res.status(201).json({ success: true, data: { ...created, ...effectivePlan(created), workspaces: 0 }, message: 'Plan created' });
  } catch (error) { next(error); }
});

// One workspace's plan, its own changes, and what it adds up to.
router.get('/workspaces/:id/plan', async (req, res, next) => {
  try {
    const ws = await workspacesRepo.getById(req.params.id);
    if (!ws) return notFound(res);
    const sub = await plansRepo.getSubscription(ws.id);
    const plan = await plansRepo.getById(sub.plan_id);
    res.json({ success: true, data: { workspaceId: ws.id, planId: sub.plan_id, planName: plan?.name, overrides: sub.overrides || {}, plan: effectivePlan(plan), effective: effectivePlan(plan, sub.overrides) } });
  } catch (error) { next(error); }
});

// Give one workspace its own changes to its plan: features on/off and limits (a key left
// out follows the plan). Replaces any earlier changes.
router.put('/workspaces/:id/overrides', async (req, res, next) => {
  try {
    const ws = await workspacesRepo.getById(req.params.id);
    if (!ws) return notFound(res);
    let overrides;
    try { overrides = overridesFrom(req.body); } catch (err) { return planError(res, err); }
    await plansRepo.setOverrides(ws.id, overrides);
    const sub = await plansRepo.getSubscription(ws.id);
    const plan = await plansRepo.getById(sub.plan_id);
    const changed = Object.keys(overrides.features).length + Object.keys(overrides.limits).length;
    activity.log(req.user.id, 'admin_set_overrides', `${ws.name}: ${changed ? `${changed} change(s)` : 'back to the plan'}`);
    res.json({ success: true, data: { overrides, effective: effectivePlan(plan, overrides) }, message: changed ? 'Custom plan saved' : 'Back to the plan as it is' });
  } catch (error) { next(error); }
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

// ─── Image engine (superadmin): the platform's image sign-in, tested in place ──

const sendError = (res, next, error) => (error.status ? res.status(error.status).json({ success: false, error: error.message }) : next(error));

// Which engine makes the app's images, and whose ChatGPT sign-in Codex uses.
router.get('/image-engine', requireSuperadmin, async (req, res, next) => {
  try {
    const images = await media.imageBackend(null);
    res.json({ success: true, data: { provider: images.provider, configured: config.images.provider, codex: await openaiImages.codexAccount() } });
  } catch (error) { sendError(res, next, error); }
});

// Start signing Codex in with a ChatGPT account: a one-time code to approve on OpenAI's page.
router.post('/image-engine/codex-login', requireSuperadmin, async (req, res, next) => {
  try {
    const login = await codexLogin.startLogin();
    activity.log(req.user.id, 'admin_codex_login_start', null);
    res.json({ success: true, data: login });
  } catch (error) { sendError(res, next, error); }
});

// Has the code been approved yet? Saves the sign-in when it has.
router.post('/image-engine/codex-login/:loginId', requireSuperadmin, async (req, res, next) => {
  try {
    if (!codexLogin.isLoginId(req.params.loginId)) return notFound(res);
    const result = await codexLogin.checkLogin(req.params.loginId);
    if (result.status === 'done') activity.log(req.user.id, 'admin_codex_login', result.account?.email || null);
    res.json({ success: true, data: result });
  } catch (error) { sendError(res, next, error); }
});

// One real test image (uses one image from the engine's quota), shown back to the admin.
router.post('/image-engine/test', requireSuperadmin, async (req, res, next) => {
  try {
    const images = await media.imageBackend(null);
    const jpeg = await images.generate('A simple product photo test: one plain gold ring on a soft cream background, centred, studio light. No text.', [], { format: 'square' });
    res.json({ success: true, data: { provider: images.provider, image: `data:image/jpeg;base64,${jpeg.toString('base64')}` } });
  } catch (error) {
    res.json({ success: true, data: { provider: config.images.provider, error: String(error.message || error).slice(0, 300) } });
  }
});

export default router;
