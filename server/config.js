import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(ROOT_DIR, '.env') });

function resolveFromRoot(value, fallback) {
  if (!value) return path.join(ROOT_DIR, fallback);
  return path.isAbsolute(value) ? value : path.join(ROOT_DIR, value);
}

const dataDir = resolveFromRoot(process.env.DATA_DIR, 'data');
const backupDir = path.join(dataDir, 'backups');
const uploadDir = path.join(dataDir, 'restore-uploads');
const reportDir = path.join(dataDir, 'reports');

for (const dir of [dataDir, backupDir, uploadDir, reportDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

function persistentJwtSecret() {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 32) {
    return process.env.JWT_SECRET.trim();
  }
  const secretPath = path.join(dataDir, '.jwt-secret');
  if (fs.existsSync(secretPath)) {
    const existing = fs.readFileSync(secretPath, 'utf8').trim();
    if (existing.length >= 32) return existing;
  }
  const generated = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(secretPath, generated, { mode: 0o600 });
  return generated;
}

export const config = {
  rootDir: ROOT_DIR,
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  dataDir,
  backupDir,
  uploadDir,
  reportDir,
  databasePath: resolveFromRoot(process.env.DATABASE_PATH, 'data/hisab-kitab.sqlite'),
  jwtSecret: persistentJwtSecret(),
  sessionHours: Number(process.env.SESSION_HOURS || 12),
  cookieSecure: String(process.env.COOKIE_SECURE || 'false') === 'true',
  clientOrigin: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  adminDisplayName: process.env.ADMIN_DISPLAY_NAME || 'Imran Arain',
  autoBackup: String(process.env.AUTO_BACKUP || 'true') !== 'false',
  backupHour: Math.min(23, Math.max(0, Number(process.env.BACKUP_HOUR || 2))),
  backupRetentionDays: Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS || 30)),
  maxBackupBytes: Math.max(1, Number(process.env.MAX_BACKUP_MB || 200)) * 1024 * 1024,
  serveClient: String(process.env.SERVE_CLIENT || 'true') !== 'false',
  timezone: 'Asia/Karachi',
  version: '1.0.0',
  isProduction: process.env.NODE_ENV === 'production'
};

export function assertConfig() {
  if (!Number.isFinite(config.port) || config.port <= 0 || config.port > 65535) {
    throw new Error('PORT must be a valid port number.');
  }
  if (!Number.isFinite(config.sessionHours) || config.sessionHours <= 0) {
    throw new Error('SESSION_HOURS must be greater than zero.');
  }
  if (config.isProduction && !config.cookieSecure) {
    console.warn('Warning: COOKIE_SECURE is false in production. Enable it when using HTTPS.');
  }
}
