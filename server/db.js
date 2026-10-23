import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';

let connection = null;
let restoring = false;

const schema = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

function configure(db) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  db.exec(schema);
}

export function openDatabase(filePath = config.databasePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  connection = new Database(filePath);
  configure(connection);
  return connection;
}

export function getDb() {
  if (!connection || !connection.open) {
    return openDatabase();
  }
  return connection;
}

export function closeDatabase() {
  if (connection && connection.open) {
    connection.close();
  }
  connection = null;
}

export function replaceDatabaseFile(sourcePath) {
  if (!connection) openDatabase();
  closeDatabase();

  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${config.databasePath}${suffix}`;
    if (fs.existsSync(sidecar)) fs.rmSync(sidecar, { force: true });
  }

  fs.copyFileSync(sourcePath, config.databasePath);
  return openDatabase(config.databasePath);
}

export function isRestoring() {
  return restoring;
}

export function setRestoring(value) {
  restoring = Boolean(value);
}

export function databaseInfo() {
  const db = getDb();
  return {
    path: config.databasePath,
    sizeBytes: fs.existsSync(config.databasePath) ? fs.statSync(config.databasePath).size : 0,
    quickCheck: db.pragma('quick_check', { simple: true })
  };
}

export function closeOnExit() {
  try {
    closeDatabase();
  } catch {
    // Ignore shutdown errors.
  }
}
