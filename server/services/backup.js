import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import cron from 'node-cron';
import { config } from '../config.js';
import { getDb, replaceDatabaseFile, setRestoring } from '../db.js';
import { HttpError, nowIso, pkParts } from '../lib.js';
import { logAudit } from './audit.js';

function timestampForFile() {
  const parts = pkParts();
  return `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}-${crypto.randomBytes(2).toString('hex')}`;
}

export async function createBackup({ trigger = 'manual', note = null, userId = null } = {}) {
  const db = getDb();
  const filename = `hisab-backup-${timestampForFile()}.sqlite`;
  const destination = path.join(config.backupDir, filename);
  let sizeBytes = 0;

  try {
    await db.backup(destination);
    sizeBytes = fs.statSync(destination).size;
    const info = db
      .prepare(
        `INSERT INTO backups (filename, size_bytes, trigger_type, status, note, created_at)
         VALUES (?, ?, ?, 'success', ?, ?)`
      )
      .run(filename, sizeBytes, trigger, note, nowIso());
    const backup = db.prepare('SELECT * FROM backups WHERE id = ?').get(info.lastInsertRowid);
    try {
      logAudit({
        entityType: 'backup',
        entityId: backup.id,
        action: 'backup.created',
        details: { filename, sizeBytes, trigger, note },
        userId,
        db
      });
    } catch {
      // A missing audit row must not invalidate a successful backup.
    }
    pruneBackups();
    return { ...backup, filePath: destination };
  } catch (error) {
    try {
      db.prepare(
        `INSERT INTO backups (filename, size_bytes, trigger_type, status, note, created_at)
         VALUES (?, ?, ?, 'failed', ?, ?)`
      ).run(filename, sizeBytes, trigger, String(error.message || error), nowIso());
    } catch {
      // Ignore logging failures.
    }
    if (fs.existsSync(destination)) fs.rmSync(destination, { force: true });
    throw new HttpError(500, `Backup failed: ${error.message}`);
  }
}

export function pruneBackups() {
  const db = getDb();
  const cutoff = new Date(Date.now() - config.backupRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  const old = db
    .prepare(
      "SELECT * FROM backups WHERE created_at < ? AND trigger_type IN ('manual', 'auto') AND status = 'success'"
    )
    .all(cutoff);
  for (const row of old) {
    const filePath = path.join(config.backupDir, path.basename(row.filename));
    if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
    db.prepare('DELETE FROM backups WHERE id = ?').run(row.id);
  }
}

export function backupStatus() {
  const db = getDb();
  const lastSuccess = db
    .prepare("SELECT * FROM backups WHERE status = 'success' ORDER BY created_at DESC LIMIT 1")
    .get();
  const lastFailure = db
    .prepare("SELECT * FROM backups WHERE status = 'failed' ORDER BY created_at DESC LIMIT 1")
    .get();
  const history = db.prepare('SELECT * FROM backups ORDER BY created_at DESC LIMIT 25').all();
  const nextScheduled = config.autoBackup ? nextBackupDate() : null;
  return {
    lastBackup: lastSuccess || null,
    lastFailure: lastFailure || null,
    history: history.map((row) => ({
      ...row,
      available: fs.existsSync(path.join(config.backupDir, path.basename(row.filename)))
    })),
    automatic: {
      enabled: config.autoBackup,
      timezone: config.timezone,
      dailyAt: `${String(config.backupHour).padStart(2, '0')}:00`,
      nextRun: nextScheduled,
      retentionDays: config.backupRetentionDays
    },
    storage: {
      databasePath: config.databasePath,
      serverBackupDirectory: config.backupDir,
      databaseSizeBytes: fs.existsSync(config.databasePath) ? fs.statSync(config.databasePath).size : 0,
      note:
        'Backups are stored on this server/computer. Download a copy to keep it on another device. A downloaded file is only as safe as the device where you store it.'
    }
  };
}

export function nextBackupDate() {
  const parts = pkParts();
  const nowUtc = Date.now();
  const todayTargetUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    config.backupHour - 5,
    0,
    0
  );
  const target = todayTargetUtc > nowUtc ? todayTargetUtc : todayTargetUtc + 24 * 60 * 60 * 1000;
  return new Date(target).toISOString();
}

export function backupFilePath(filename) {
  const safeName = path.basename(filename);
  if (safeName !== filename) throw new HttpError(400, 'Invalid backup filename.');
  const filePath = path.join(config.backupDir, safeName);
  if (!fs.existsSync(filePath)) throw new HttpError(404, 'Backup file is no longer available.');
  return filePath;
}

const REQUIRED_TABLES = [
  'users',
  'suppliers',
  'transactions',
  'audit_logs',
  'backups',
  'settings'
];

export function validateBackupFile(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.size < 100) throw new HttpError(400, 'The selected file is too small to be a valid backup.');
  const fd = fs.openSync(filePath, 'r');
  const header = Buffer.alloc(16);
  fs.readSync(fd, header, 0, 16, 0);
  fs.closeSync(fd);
  if (header.toString('utf8', 0, 15) !== 'SQLite format 3') {
    throw new HttpError(400, 'The selected file is not a valid SQLite backup.');
  }

  let test;
  try {
    test = new Database(filePath, { readonly: true, fileMustExist: true });
    const integrity = test.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') {
      throw new HttpError(400, 'Backup integrity check failed. The file may be corrupted.');
    }
    const tables = test
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((row) => row.name);
    const missing = REQUIRED_TABLES.filter((table) => !tables.includes(table));
    if (missing.length) {
      throw new HttpError(400, `Invalid backup: missing required tables (${missing.join(', ')}).`);
    }
    const triggers = test
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('trigger', 'view')")
      .all();
    if (triggers.length) {
      throw new HttpError(400, 'Invalid backup: unexpected database triggers or views were found.');
    }
    const users = test.prepare('SELECT COUNT(*) AS count FROM users').get().count;
    if (!users) throw new HttpError(400, 'Invalid backup: it does not contain any user account.');
    const suppliers = test.prepare('SELECT COUNT(*) AS count FROM suppliers').get().count;
    const transactions = test.prepare('SELECT COUNT(*) AS count FROM transactions').get().count;
    const transactionColumns = test
      .prepare('PRAGMA table_info(transactions)')
      .all()
      .map((row) => row.name);
    for (const required of ['amount_paise', 'type', 'txn_date', 'status', 'supplier_id', 'created_at']) {
      if (!transactionColumns.includes(required)) {
        throw new HttpError(400, 'Invalid backup: transaction schema is incomplete.');
      }
    }
    return {
      sizeBytes: stat.size,
      users,
      suppliers,
      transactions,
      integrity,
      tables
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, `Could not validate backup file: ${error.message}`);
  } finally {
    if (test) {
      try {
        test.close();
      } catch {
        // Ignore close errors.
      }
    }
  }
}

export async function restoreBackup({ filePath, userId = null }) {
  const validation = validateBackupFile(filePath);
  const safety = await createBackup({
    trigger: 'pre-restore',
    note: 'Automatic safety backup created before restore',
    userId
  });

  setRestoring(true);
  try {
    replaceDatabaseFile(filePath);
    const db = getDb();
    try {
      logAudit({
        entityType: 'system',
        action: 'system.restored',
        details: {
          restoredFrom: path.basename(filePath),
          validation,
          safetyBackup: safety.filename
        },
        userId,
        db
      });
    } catch {
      // The restore itself has succeeded.
    }
    return { validation, safetyBackup: safety.filename };
  } catch (error) {
    try {
      replaceDatabaseFile(safety.filePath);
    } catch {
      // Keep original error; the safety backup remains on disk.
    }
    throw new HttpError(500, `Restore failed and the safety backup was used to recover: ${error.message}`);
  } finally {
    setRestoring(false);
  }
}

export function startBackupScheduler() {
  if (!config.autoBackup) {
    console.log('Automatic backups are disabled.');
    return null;
  }
  const expression = `0 ${config.backupHour} * * *`;
  const job = cron.schedule(
    expression,
    async () => {
      try {
        const backup = await createBackup({
          trigger: 'auto',
          note: `Scheduled daily backup at ${String(config.backupHour).padStart(2, '0')}:00 Asia/Karachi`
        });
        console.log(`Automatic backup created: ${backup.filename}`);
      } catch (error) {
        console.error('Automatic backup failed:', error.message);
      }
    },
    { timezone: config.timezone }
  );
  console.log(
    `Automatic backups enabled daily at ${String(config.backupHour).padStart(2, '0')}:00 (${config.timezone}).`
  );
  return job;
}
