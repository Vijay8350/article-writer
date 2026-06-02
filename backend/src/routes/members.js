import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace, requireWorkspaceRole } from '../middleware/workspace.js';
import * as memberships from '../repositories/memberships.js';

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
