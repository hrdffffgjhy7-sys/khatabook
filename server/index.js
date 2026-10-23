import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config, assertConfig } from './config.js';
import { closeOnExit, getDb, isRestoring } from './db.js';
import { HttpError, nowIso } from './lib.js';
import { ensureAdminFromEnv } from './services/auth.js';
import { startBackupScheduler } from './services/backup.js';
import { preventCrossSiteWrites, requireAuth } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { suppliersRouter } from './routes/suppliers.js';
import { transactionsRouter } from './routes/transactions.js';
import { reportsRouter } from './routes/reports.js';
import { backupsRouter } from './routes/backups.js';
import { auditRouter } from './routes/audit.js';
import { settingsRouter } from './routes/settings.js';

assertConfig();
getDb();
ensureAdminFromEnv();
const backupJob = startBackupScheduler();

const app = express();
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: config.isProduction
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:'],
            fontSrc: ["'self'"],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"]
          }
        }
      : false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' }
  })
);

app.use('/api', (req, res, next) => {
  const origin = req.get('origin');
  if (!origin) return next();
  const host = req.get('host');
  const sameOrigin = origin === `http://${host}` || origin === `https://${host}`;
  if (sameOrigin || config.clientOrigin.includes(origin)) return next();
  return res.status(403).json({ error: 'This origin is not allowed to access the API.' });
});

app.use('/api', cors({ credentials: true, origin: true }));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());
app.use('/api', preventCrossSiteWrites);
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (isRestoring()) {
    return res.status(503).json({ error: 'A database restore is in progress. Please wait a moment.' });
  }
  return next();
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' }
});
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down and try again.' }
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    app: 'Imran Arain Hisab Kitab',
    version: config.version,
    timezone: config.timezone,
    now: nowIso()
  });
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRouter);
app.use('/api/dashboard', requireAuth, dashboardRouter);
app.use('/api/suppliers', requireAuth, suppliersRouter);
app.use('/api/transactions', requireAuth, transactionsRouter);
app.use('/api/reports', requireAuth, reportsRouter);
app.use('/api/backups', requireAuth, backupsRouter);
app.use('/api/audit', requireAuth, auditRouter);
app.use('/api/settings', requireAuth, settingsRouter);

const clientDist = path.join(config.rootDir, 'client', 'dist');
if (config.serveClient && fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist, { maxAge: '1h', index: false }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    return res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.json({
      app: 'Imran Arain Hisab Kitab API',
      message: config.env === 'development' ? 'Run the Vite client separately with npm run dev.' : 'Client build not found.',
      health: '/api/health'
    });
  });
}

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});

app.use((error, _req, res, _next) => {
  if (res.headersSent) return;
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message, details: error.details });
  }
  if (error.name === 'ZodError') {
    return res.status(400).json({
      error: 'Please check the highlighted fields.',
      details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
    });
  }
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `Backup file is too large. Maximum size is ${config.maxBackupBytes / 1024 / 1024} MB.` });
  }
  if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ error: 'This record already exists.' });
  }
  console.error(error);
  return res.status(500).json({
    error: 'Something went wrong on the server. Please try again.',
    ...(config.isProduction ? {} : { detail: error.message })
  });
});

const server = app.listen(config.port, () => {
  console.log('');
  console.log('Imran Arain Hisab Kitab');
  console.log(`API listening on http://localhost:${config.port}`);
  console.log(`Database: ${config.databasePath}`);
  console.log(`Backups:  ${config.backupDir}`);
  if (config.env === 'development') console.log('Open the app at http://localhost:5173');
  console.log('');
});

function shutdown(signal) {
  console.log(`\n${signal} received. Closing...`);
  backupJob?.stop();
  server.close(() => {
    closeOnExit();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});
