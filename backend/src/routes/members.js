import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace, requireWorkspaceRole } from '../middleware/workspace.js';
import * as memberships from '../repositories/memberships.js';
import * as usersRepo from '../repositories/users.js';
import * as activity from '../repositories/activity.js';

// Generates a memorable-ish temp password: 12 chars from a URL-safe alphabet.
function generateTempPassword() {
  const alpha = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; // no ambiguous 0/O/1/l
  const bytes = crypto.randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) out += alpha[bytes[i] % alpha.length];
  return out;
}

const router = Router();
router.use(requireAuth, requireWorkspace);

router.get('/', async (req, res, next) => {
  try { res.json({ success: true, data: await memberships.list(req.workspace.id) }); }
  catch (error) { next(error); }
});

// Change a member's role: only owner can do this. Don't demote the only owner.
router.patch('/:userId/role', requireWorkspaceRole('owner'), async (req, res, next) => {
  try {
    const { role } = req.body || {};
    if (!['owner', 'admin', 'member'].includes(role)) return res.status(400).json({ success: false, error: 'Invalid role' });
    const current = await memberships.get(req.workspace.id, req.params.userId);
    if (!current) return res.status(404).json({ success: false, error: 'Member not found' });
    if (current.role === 'owner' && role !== 'owner') {
      const ownerCount = await memberships.countByRole(req.workspace.id, 'owner');
      if (ownerCount <= 1) return res.status(400).json({ success: false, error: 'Cannot demote the only owner' });
    }
    await memberships.setRole(req.workspace.id, req.params.userId, role);
    res.json({ success: true, message: 'Role updated' });
  } catch (error) { next(error); }
});

// Reset a member's password — generates a temp password, returned ONCE so the
// resetter can share it with the user. The user should change it on next login.
//   - Owner can reset anyone except themselves.
//   - Admin can reset members only (not other admins or the owner).
router.post('/:userId/reset-password', requireWorkspaceRole('owner', 'admin'), async (req, res, next) => {
  try {
    if (req.params.userId === req.user.id) {
      return res.status(400).json({ success: false, error: 'Use "Change password" in Account to set your own.' });
    }
    const target = await memberships.get(req.workspace.id, req.params.userId);
    if (!target) return res.status(404).json({ success: false, error: 'Member not found in this workspace' });

    // Admins can only act on members; owner can act on anyone (except self).
    if (target.role !== 'member' && req.membership.role !== 'owner') {
      return res.status(403).json({ success: false, error: 'Only an owner can reset an admin or owner password' });
    }

    const tempPassword = generateTempPassword();
    const hash = await bcrypt.hash(tempPassword, 10);
    await usersRepo.updatePasswordHash(target.user_id, hash);

    const u = await usersRepo.getById(target.user_id);
    activity.log(req.user.id, 'admin_reset_member_password', u?.email);

    // The plaintext is returned ONCE for the resetter to share. We never log it.
    res.json({
      success: true,
      data: {
        email: u?.email,
        tempPassword,
        notice: 'Share this password securely with the user. They should change it after logging in.',
      },
    });
  } catch (error) { next(error); }
});

// Remove a member: owner or admin. Cannot remove the only owner, cannot self-remove if you're the only owner.
router.delete('/:userId', requireWorkspaceRole('owner', 'admin'), async (req, res, next) => {
  try {
    const target = await memberships.get(req.workspace.id, req.params.userId);
    if (!target) return res.status(404).json({ success: false, error: 'Member not found' });
    if (target.role === 'owner') {
      const ownerCount = await memberships.countByRole(req.workspace.id, 'owner');
      if (ownerCount <= 1) return res.status(400).json({ success: false, error: 'Cannot remove the only owner' });
    }
    // Admins can't remove other admins; only owners can.
    if (target.role === 'admin' && req.membership.role !== 'owner') {
      return res.status(403).json({ success: false, error: 'Only an owner can remove an admin' });
    }
    await memberships.remove(req.workspace.id, req.params.userId);
    res.json({ success: true, message: 'Member removed' });
  } catch (error) { next(error); }
});

export default router;
