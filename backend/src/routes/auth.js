import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, withTransaction } from '../db/index.js';
import config from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import * as activity from '../repositories/activity.js';
import * as workspaces from '../repositories/workspaces.js';
import * as memberships from '../repositories/memberships.js';
import * as usersRepo from '../repositories/users.js';
import { rateLimit } from '../lib/rateLimit.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

// Public sign-up and login, so each visitor gets a few tries only.
const signupLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: 'Too many sign-ups from your connection. Try again in an hour.' });
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many sign-in attempts. Wait a few minutes and try again.' });
const loginEmailLimit = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10, message: 'Too many sign-in attempts for this account. Wait a few minutes and try again.',
  key: (req) => `email:${String(req.body?.email || '').trim().toLowerCase()}`,
});

// What the app needs right after signing in: a token, who you are, your workspaces.
async function session(user) {
  return {
    token: signToken(user),
    user: { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status },
    workspaces: await workspaces.listForUser(user.id),
  };
}

// POST /api/auth/register — anyone can sign up and starts at once in a workspace of
// their own, on the Free plan (its limits cap what an account can use; a vendor admin
// can suspend it).
router.post('/register', signupLimit, async (req, res, next) => {
  try {
    const { password, workspaceName } = req.body || {};
    const email = String(req.body?.email || '').trim();
    const name = String(req.body?.name || '').trim().slice(0, 100) || null;

    if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ success: false, error: 'A valid email is required' });
    if (!password || password.length < 8) return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    if (password.length > 200) return res.status(400).json({ success: false, error: 'That password is too long' });

    if (await usersRepo.emailExists(email)) return res.status(409).json({ success: false, error: 'An account with this email already exists. Sign in instead.' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await usersRepo.createUser({ email, passwordHash, name, role: 'user', status: 'active' });

    // Every account starts with a workspace of its own (its store, its data, its plan).
    const wsName = (workspaceName && String(workspaceName).trim().slice(0, 100)) || (name ? `${name}'s Workspace` : `${email.split('@')[0]}'s Workspace`);
    await workspaces.createForOwner(user.id, wsName);

    activity.log(user.id, 'signup', user.email);
    res.status(201).json({ success: true, data: await session(user) });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, error: 'An account with this email already exists. Sign in instead.' });
    next(error);
  }
});

// POST /api/auth/login
router.post('/login', loginLimit, loginEmailLimit, async (req, res, next) => {
  try {
    const { password } = req.body || {};
    const email = String(req.body?.email || '').trim(); // emails are citext, so case doesn't matter
    if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password are required' });

    const { rows } = await query(
      'SELECT id, email, name, role, status, password_hash, kind FROM users WHERE email = $1',
      [email]
    );
    const user = rows[0];
    // Accounts behind a Shopify install have no password; they open from the Shopify admin only.
    const ok = user && user.kind !== 'shopify' && (await bcrypt.compare(String(password || ''), user.password_hash).catch(() => false));
    if (!ok) return res.status(401).json({ success: false, error: 'Invalid email or password' });

    if (user.status === 'suspended') return res.status(403).json({ success: false, code: 'SUSPENDED', error: 'Your account has been suspended.' });
    // Sign-ups no longer wait for approval: an account still waiting from before starts now.
    if (user.status === 'pending') { await usersRepo.setStatus(user.id, 'active'); user.status = 'active'; }

    activity.log(user.id, 'login', user.email);
    res.json({ success: true, data: await session(user) });
  } catch (error) { next(error); }
});

// POST /api/auth/change-password — user changes their own password
router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'New password must be at least 8 characters' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ success: false, error: 'New password must be different from the current one' });
    }

    const hash = await usersRepo.getPasswordHash(req.user.id);
    if (!hash) return res.status(401).json({ success: false, error: 'Account not found' });

    const ok = await bcrypt.compare(currentPassword, hash);
    if (!ok) return res.status(401).json({ success: false, error: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(newPassword, 10);
    await usersRepo.updatePasswordHash(req.user.id, newHash);
    activity.log(req.user.id, 'change_password', 'self');
    res.json({ success: true, message: 'Password updated' });
  } catch (error) { next(error); }
});

// GET /api/auth/me — returns user + their workspaces (with role per workspace)
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, email, name, role, status, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (rows.length === 0) return res.status(401).json({ success: false, error: 'User no longer exists' });
    const ws = await workspaces.listForUser(req.user.id);
    res.json({ success: true, data: { ...rows[0], workspaces: ws } });
  } catch (error) { next(error); }
});

export default router;
