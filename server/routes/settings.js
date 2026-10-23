import express from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { databaseInfo, getDb } from '../db.js';
import { asyncHandler, HttpError, nowIso } from '../lib.js';
import { logAudit } from '../services/audit.js';
import { requireAdmin } from '../middleware/auth.js';

export const settingsRouter = express.Router();

function getSettings() {
  const rows = getDb().prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const db = getDb();
    const testCounts = db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM suppliers WHERE is_test = 1) AS suppliers,
          (SELECT COUNT(*) FROM transactions WHERE is_test = 1) AS transactions`
      )
      .get();
    res.json({
      settings: getSettings(),
      system: {
        version: config.version,
        environment: config.env,
        timezone: config.timezone,
        database: databaseInfo(),
        automaticBackups: {
          enabled: config.autoBackup,
          dailyAt: `${String(config.backupHour).padStart(2, '0')}:00`,
          timezone: config.timezone
        },
        testData: testCounts
      }
    });
  })
);

settingsRouter.patch(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const schema = z.object({
      shopName: z.string().trim().min(1).max(120),
      shopPhone: z.string().trim().max(40).optional().default(''),
      shopAddress: z.string().trim().max(300).optional().default('')
    });
    const data = schema.parse(req.body);
    const db = getDb();
    const now = nowIso();
    db.transaction(() => {
      const update = db.prepare(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
      );
      update.run('shop_name', data.shopName, now);
      update.run('shop_phone', data.shopPhone || '', now);
      update.run('shop_address', data.shopAddress || '', now);
      logAudit({
        entityType: 'settings',
        action: 'settings.updated',
        details: data,
        userId: req.user.id,
        db
      });
    })();
    res.json({ settings: getSettings() });
  })
);

settingsRouter.delete(
  '/test-data',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const confirmation = z.string().trim().parse(req.body?.confirmation || '');
    if (confirmation !== 'DELETE TEST DATA') {
      throw new HttpError(400, 'Type DELETE TEST DATA exactly to remove sample records.');
    }
    const db = getDb();
    const result = db.transaction(() => {
      const supplierIds = db.prepare('SELECT id FROM suppliers WHERE is_test = 1').all().map((row) => row.id);
      if (!supplierIds.length) return { suppliers: 0, transactions: 0 };
      const placeholders = supplierIds.map(() => '?').join(',');
      const transactionCount = db
        .prepare(`SELECT COUNT(*) AS count FROM transactions WHERE is_test = 1 OR supplier_id IN (${placeholders})`)
        .get(...supplierIds).count;
      db.prepare(
        `DELETE FROM audit_logs WHERE supplier_id IN (${placeholders})
          OR transaction_id IN (SELECT id FROM transactions WHERE is_test = 1 OR supplier_id IN (${placeholders}))`
      ).run(...supplierIds, ...supplierIds);
      db.prepare(`DELETE FROM transactions WHERE is_test = 1 OR supplier_id IN (${placeholders})`).run(...supplierIds);
      db.prepare(`DELETE FROM suppliers WHERE id IN (${placeholders}) AND is_test = 1`).run(...supplierIds);
      logAudit({
        entityType: 'system',
        action: 'test_data.removed',
        details: { suppliers: supplierIds.length, transactions: transactionCount },
        userId: req.user.id,
        db
      });
      return { suppliers: supplierIds.length, transactions: transactionCount };
    })();
    res.json({ ok: true, removed: result });
  })
);
