import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace, requireWorkspaceRole } from '../middleware/workspace.js';
import * as workspaces from '../repositories/workspaces.js';

const router = Router();
router.use(requireAuth);

// All workspaces the caller belongs to.
router.get('/', async (req, res, next) => {
  try { res.json({ success: true, data: await workspaces.listForUser(req.user.id) }); }
  catch (error) { next(error); }
});

// Create a new workspace (caller becomes owner).
router.post('/', async (req, res, next) => {
  try {
    const { name } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ success: false, error: 'Workspace name is required' });
    const w = await workspaces.createForOwner(req.user.id, String(name).trim());
    res.status(201).json({ success: true, data: { ...w, role: 'owner' } });
  } catch (error) { next(error); }
});

// Rename (owner/admin)
router.patch('/current', requireWorkspace, requireWorkspaceRole('owner', 'admin'), async (req, res, next) => {
  try {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ success: false, error: 'name is required' });
    await workspaces.rename(req.workspace.id, String(name).trim());
    res.json({ success: true, message: 'Workspace renamed' });
  } catch (error) { next(error); }
});

export default router;
