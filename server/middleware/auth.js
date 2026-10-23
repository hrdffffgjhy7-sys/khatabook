import { COOKIE_NAME, getUserById, verifySession } from '../services/auth.js';

export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  const payload = token ? verifySession(token) : null;
  if (!payload) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const user = getUserById(payload.sub);
  if (!user) {
    res.clearCookie(COOKIE_NAME);
    return res.status(401).json({ error: 'Your session is no longer valid.' });
  }
  req.user = user;
  return next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access is required.' });
  }
  return next();
}

export function preventCrossSiteWrites(req, res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    if (req.get('X-Requested-With') !== 'XMLHttpRequest') {
      return res.status(403).json({ error: 'Request verification failed. Refresh the page and try again.' });
    }
  }
  return next();
}
