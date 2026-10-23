import express from 'express';
import { z } from 'zod';
import { getDb } from '../db.js';
import { asyncHandler, HttpError, nowIso } from '../lib.js';
import { logAudit } from '../services/audit.js';
import {
  COOKIE_NAME,
  createUser,
  getUserById,
  hashPassword,
  issueSession,
  publicUser,
  sessionCookieOptions,
  userCount,
  verifyPassword,
  verifySession
} from '../services/auth.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = express.Router();

const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must contain at least 3 characters.')
  .max(50, 'Username is too long.')
  .regex(/^[a-zA-Z0-9._-]+$/, 'Username may only contain letters, numbers, dots, dashes and underscores.');

const passwordSchema = z
  .string()
  .min(8, 'Password must contain at least 8 characters.')
  .max(128, 'Password is too long.');

const setupSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(2, 'Display name is required.').max(80)
});

authRouter.get('/status', (req, res) => {
  const count = userCount();
  const token = req.cookies?.[COOKIE_NAME];
  const payload = token ? verifySession(token) : null;
  const user = payload ? getUserById(payload.sub) : null;
  res.json({
    needsSetup: count === 0,
    authenticated: Boolean(user),
    user: publicUser(user)
  });
});

authRouter.post(
  '/setup',
  asyncHandler(async (req, res) => {
    if (userCount() > 0) {
      throw new HttpError(409, 'Setup has already been completed.');
    }
    const data = setupSchema.parse(req.body);
    const user = createUser({
      username: data.username,
      password: data.password,
      displayName: data.displayName
    });
    res.cookie(COOKIE_NAME, issueSession(user), sessionCookieOptions());
    res.status(201).json({ user: publicUser(user) });
  })
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      username: z.string().trim().min(1).max(50),
      password: z.string().min(1).max(128)
    });
    const data = schema.parse(req.body);
    const user = getDb()
      .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE')
      .get(data.username);
    if (!user || !verifyPassword(data.password, user.password_hash)) {
      console.warn(
        `[login-failed] username=${JSON.stringify(data.username)} userFound=${Boolean(user)} passwordLength=${data.password.length}`
      );
      throw new HttpError(401, 'Incorrect username or password.');
    }
    res.cookie(COOKIE_NAME, issueSession(user), sessionCookieOptions());
    logAudit({
      entityType: 'user',
      entityId: user.id,
      action: 'auth.login',
      userId: user.id
    });
    res.json({ user: publicUser(user) });
  })
);

authRouter.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { ...sessionCookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

authRouter.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const schema = z.object({
      currentPassword: z.string().min(1).max(128),
      newPassword: passwordSchema
    });
    const data = schema.parse(req.body);
    if (!verifyPassword(data.currentPassword, req.user.password_hash)) {
      throw new HttpError(400, 'Current password is incorrect.');
    }
    if (data.currentPassword === data.newPassword) {
      throw new HttpError(400, 'New password must be different from the current password.');
    }
    const now = nowIso();
    getDb()
      .prepare('UPDATE users SET password_hash = ?, password_changed_at = ?, updated_at = ? WHERE id = ?')
      .run(hashPassword(data.newPassword), now, now, req.user.id);
    logAudit({
      entityType: 'user',
      entityId: req.user.id,
      action: 'auth.password_changed',
      details: { changedAt: now },
      userId: req.user.id
    });
    res.json({ ok: true });
  })
);
