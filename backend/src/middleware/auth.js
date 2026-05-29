import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import { query } from '../db/index.js';

// Verifies the Bearer JWT, then loads the user's CURRENT role + status from the
// DB so approvals, suspensions, and role changes take effect immediately
// (no stale token). Sets req.user = { id, role, status }.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret);
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  try {
    const { rows } = await query('SELECT id, role, status FROM users WHERE id = $1', [payload.sub]);
    const u = rows[0];
    if (!u) return res.status(401).json({ success: false, error: 'User no longer exists' });
    if (u.status === 'suspended') {
      return res.status(403).json({ success: false, error: 'Your account has been suspended.', code: 'SUSPENDED' });
    }
    if (u.status === 'pending') {
      return res.status(403).json({ success: false, error: 'Your account is awaiting approval.', code: 'PENDING' });
    }
    req.user = { id: u.id, role: u.role, status: u.status };
    next();
  } catch (err) {
    next(err);
  }
}

const ADMIN_ROLES = new Set(['admin', 'superadmin']);

// Admin or superadmin.
export function requireAdmin(req, res, next) {
  if (!ADMIN_ROLES.has(req.user?.role)) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
}

// Superadmin only (role/subscription management).
export function requireSuperadmin(req, res, next) {
  if (req.user?.role !== 'superadmin') {
    return res.status(403).json({ success: false, error: 'Superadmin access required' });
  }
  next();
}
