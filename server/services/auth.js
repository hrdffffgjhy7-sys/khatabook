import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { getDb } from '../db.js';
import { nowIso, HttpError } from '../lib.js';
import { logAudit } from './audit.js';

export const COOKIE_NAME = 'hisab_session';

export function hashPassword(password) {
  return bcrypt.hashSync(password, 12);
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

export function issueSession(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    config.jwtSecret,
    { expiresIn: `${config.sessionHours}h` }
  );
}

export function verifySession(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
    maxAge: config.sessionHours * 60 * 60 * 1000
  };
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
    createdAt: user.created_at
  };
}

export function getUserById(id) {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function userCount() {
  return getDb().prepare('SELECT COUNT(*) AS count FROM users').get().count;
}

export function createUser({ username, password, displayName, role = 'admin', userId = null }) {
  const db = getDb();
  const exists = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username);
  if (exists) throw new HttpError(409, 'That username is already in use.');
  const now = nowIso();
  const result = db
    .prepare(
      `INSERT INTO users (username, password_hash, display_name, role, password_changed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(username, hashPassword(password), displayName, role, now, now, now);
  logAudit({
    entityType: 'user',
    entityId: result.lastInsertRowid,
    action: 'user.created',
    details: { username, displayName, role },
    userId
  });
  return getUserById(result.lastInsertRowid);
}

export function ensureAdminFromEnv() {
  if (userCount() > 0) return;
  if (!config.adminPassword) return;
  if (config.adminPassword.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters long.');
  }
  createUser({
    username: config.adminUsername,
    password: config.adminPassword,
    displayName: config.adminDisplayName
  });
  console.log(`Initial administrator "${config.adminUsername}" created from environment variables.`);
}
