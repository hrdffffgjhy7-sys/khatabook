import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { getDb } from '../db.js';
import { asyncHandler, HttpError, idSchema } from '../lib.js';
import { COOKIE_NAME } from '../services/auth.js';
import { requireAdmin } from '../middleware/auth.js';
import {
  backupFilePath,
  backupStatus,
  createBackup,
  restoreBackup,
  validateBackupFile
} from '../services/backup.js';

export const backupsRouter = express.Router();

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, config.uploadDir),
  filename: (_req, _file, callback) =>
    callback(null, `upload-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.sqlite`)
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxBackupBytes, files: 1 },
  fileFilter: (_req, file, callback) => {
    const name = file.originalname.toLowerCase();
    if (/\.(sqlite|sqlite3|db|backup)$/.test(name)) callback(null, true);
    else callback(new HttpError(400, 'Please select a .sqlite, .sqlite3, .db or .backup file.'));
  }
});

function cleanup(file) {
  if (file?.path && fs.existsSync(file.path)) fs.rmSync(file.path, { force: true });
}

backupsRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    res.json(backupStatus());
  })
);

backupsRouter.get(
  '/download',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const backup = await createBackup({
      trigger: 'manual',
      note: 'Manual backup downloaded from the dashboard',
      userId: req.user.id
    });
    res.download(backup.filePath, backup.filename, (error) => {
      if (error && !res.headersSent) {
        res.status(500).json({ error: 'Backup was created but could not be downloaded.' });
      }
    });
  })
);

backupsRouter.get(
  '/files/:id/download',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const backupId = idSchema.parse(req.params.id);
    const row = getDb().prepare('SELECT * FROM backups WHERE id = ?').get(backupId);
    if (!row || row.status !== 'success') throw new HttpError(404, 'Backup not found.');
    const filePath = backupFilePath(row.filename);
    res.download(filePath, row.filename);
  })
);

backupsRouter.post(
  '/validate',
  requireAdmin,
  upload.single('backup'),
  asyncHandler(async (req, res) => {
    try {
      if (!req.file) throw new HttpError(400, 'Choose a backup file to validate.');
      const validation = validateBackupFile(req.file.path);
      res.json({
        valid: true,
        originalName: req.file.originalname,
        ...validation
      });
    } finally {
      cleanup(req.file);
    }
  })
);

backupsRouter.post(
  '/restore',
  requireAdmin,
  upload.single('backup'),
  asyncHandler(async (req, res) => {
    try {
      if (!req.file) throw new HttpError(400, 'Choose a backup file to restore.');
      const confirmation = z.string().trim().parse(req.body.confirmation || '');
      if (confirmation !== 'RESTORE') {
        throw new HttpError(400, 'Type RESTORE exactly to confirm the database replacement.');
      }
      if (String(req.body.acknowledgeOverwrite || '') !== 'true') {
        throw new HttpError(400, 'Please confirm that current data will be replaced.');
      }
      const result = await restoreBackup({ filePath: req.file.path, userId: req.user.id });
      res.clearCookie(COOKIE_NAME, { path: '/' });
      res.json({
        ok: true,
        message:
          'Database restored successfully. Existing data was backed up first. Please sign in again.',
        ...result
      });
    } finally {
      cleanup(req.file);
    }
  })
);
