import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import * as workspaces from '../repositories/workspaces.js';

// Our own sign-in token and what the app needs right after signing in.
export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
}

export async function buildSession(user, { expiresIn } = {}) {
  return {
    token: expiresIn ? jwt.sign({ sub: user.id, role: user.role }, config.jwt.secret, { expiresIn }) : signToken(user),
    user: { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status, kind: user.kind || 'web' },
    workspaces: await workspaces.listForUser(user.id),
  };
}
