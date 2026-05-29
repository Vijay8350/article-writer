import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/index.js';
import config from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import * as activity from '../repositories/activity.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name } = req.body || {};

    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, error: 'A valid email is required' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }

    const exists = await query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (exists.rowCount > 0) {
      return res.status(409).json({ success: false, error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    // New signups are 'pending' (DB default) — no token issued until an admin approves.
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, role, status, created_at`,
      [email, passwordHash, name || null]
    );

    const user = rows[0];
    activity.log(user.id, 'signup', user.email);
    res.status(201).json({
      success: true,
      pending: true,
      message: 'Account created. An administrator will review and approve your account shortly.',
      data: { user: { id: user.id, email: user.email, status: user.status } },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const { rows } = await query(
      'SELECT id, email, name, role, status, password_hash FROM users WHERE email = $1',
      [email]
    );
    const user = rows[0];

    // Same response for missing user vs wrong password (no account enumeration).
    const ok = user && (await bcrypt.compare(password, user.password_hash));
    if (!ok) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    // Block login until approved / if suspended.
    if (user.status === 'pending') {
      return res.status(403).json({ success: false, code: 'PENDING', error: 'Your account is awaiting administrator approval.' });
    }
    if (user.status === 'suspended') {
      return res.status(403).json({ success: false, code: 'SUSPENDED', error: 'Your account has been suspended.' });
    }

    activity.log(user.id, 'login', user.email);
    const token = signToken(user);
    res.json({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status },
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, email, name, role, status, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(401).json({ success: false, error: 'User no longer exists' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
});

export default router;