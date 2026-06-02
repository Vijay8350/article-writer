import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace, requireWorkspaceRole } from '../middleware/workspace.js';
import * as invitations from '../repositories/invitations.js';
import * as memberships from '../repositories/memberships.js';

const router = Router();

// ── Owner/admin endpoints (require active workspace) ─────────────────────────
const wsRouter = Router();
wsRouter.use(requireAuth, requireWorkspace);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

wsRouter.get('/', async (req, res, next) => {
  try { res.json({ success: true, data: await invitations.listForWorkspace(req.workspace.id) }); }
  catch (error) { next(error); }
});

wsRouter.post('/', requireWorkspaceRole('owner', 'admin'), async (req, res, next) => {
  try {
    const { email, role } = req.body || {};
    if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ success: false, error: 'Valid email required' });
    const r = role && ['admin', 'member'].includes(role) ? role : 'member';
    // Only owners can create admin invites.
    if (r === 'admin' && req.membership.role !== 'owner') {
      return res.status(403).json({ success: false, error: 'Only an owner can invite an admin' });
    }
    const { token, row } = await invitations.create({
      workspaceId: req.workspace.id, email, role: r, invitedBy: req.user.id,
    });
    // Until Phase 9 (email), return the accept link so the inviter can share it.
    res.status(201).json({
      success: true,
      data: { ...row, acceptToken: token, acceptUrl: `/accept-invite/${token}` },
      message: 'Invitation created. Share the link with your teammate.',
    });
  } catch (error) { next(error); }
});

wsRouter.delete('/:id', requireWorkspaceRole('owner', 'admin'), async (req, res, next) => {
  try {
    const ok = await invitations.revoke(req.workspace.id, req.params.id);
    if (!ok) return res.status(404).json({ success: false, error: 'Invitation not found or already accepted' });
    res.json({ success: true, message: 'Invitation revoked' });
  } catch (error) { next(error); }
});

// ── Accept (auth required, NO workspace required) ───────────────────────────
router.post('/accept', requireAuth, async (req, res, next) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ success: false, error: 'token is required' });

    const inv = await invitations.findByToken(token);
    if (!inv) return res.status(404).json({ success: false, error: 'Invitation not found or already used' });
    if (inv.accepted_at) return res.status(400).json({ success: false, error: 'Invitation already accepted' });
    if (new Date(inv.expires_at) < new Date()) return res.status(400).json({ success: false, error: 'Invitation expired' });

    // Optional: enforce the invited email matches the logged-in user's email.
    const me = (await query('SELECT email FROM users WHERE id = $1', [req.user.id])).rows[0];
    if (me && String(me.email).toLowerCase() !== String(inv.email).toLowerCase()) {
      return res.status(403).json({ success: false, error: `This invitation is for ${inv.email}. Sign in with that email.` });
    }

    await memberships.add(inv.workspace_id, req.user.id, inv.role);
    await invitations.markAccepted(inv.id);
    res.json({
      success: true,
      message: `You joined "${inv.workspace_name}" as ${inv.role}.`,
      data: { workspace_id: inv.workspace_id, workspace_name: inv.workspace_name, role: inv.role },
    });
  } catch (error) { next(error); }
});

// Mount: /api/invitations  →  list/create/revoke for current workspace
//        /api/invitations/accept  →  accept by token (no workspace)
router.use('/', wsRouter);

export default router;
