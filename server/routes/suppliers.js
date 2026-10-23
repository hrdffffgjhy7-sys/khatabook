import express from 'express';
import { z } from 'zod';
import { getDb } from '../db.js';
import {
  asyncHandler,
  escapeLike,
  HttpError,
  idSchema,
  nowIso,
  parseAmountToPaise,
  paiseToRupees,
  pkToday,
  supplierSerial,
  transactionEffectSql,
  transactionSerial
} from '../lib.js';
import { logAudit } from '../services/audit.js';
import { createBackup } from '../services/backup.js';
import { insertTransaction } from '../services/transactions.js';
import { requireAdmin } from '../middleware/auth.js';

export const suppliersRouter = express.Router();

const supplierBody = z.object({
  name: z.string().trim().min(1, 'Supplier name is required.').max(120),
  phone: z.string().trim().max(40).optional().default(''),
  address: z.string().trim().max(500).optional().default(''),
  notes: z.string().trim().max(2000).optional().default(''),
  openingBalance: z.union([z.string(), z.number()]).optional().default(0)
});

const supplierPatch = supplierBody.partial();

const supplierAggregate = (whereClause = '', params = []) =>
  getDb()
    .prepare(
      `SELECT s.*,
        COALESCE(SUM(${transactionEffectSql('t')}), 0) AS balance_paise,
        COALESCE(SUM(CASE WHEN t.type = 'purchase' THEN t.amount_paise
          WHEN t.type = 'purchase_reversal' THEN -t.amount_paise ELSE 0 END), 0) AS purchases_paise,
        COALESCE(SUM(CASE WHEN t.type = 'payment' THEN t.amount_paise
          WHEN t.type = 'payment_reversal' THEN -t.amount_paise ELSE 0 END), 0) AS payments_paise,
        COUNT(t.id) AS transaction_count,
        MAX(t.txn_date) AS last_transaction_date
       FROM suppliers s
       LEFT JOIN transactions t ON t.supplier_id = s.id
       ${whereClause}
       GROUP BY s.id`
    )
    .all(...params);

suppliersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const includeArchived = String(req.query.includeArchived || '') === 'true';
    const conditions = [];
    const params = [];
    if (!includeArchived) conditions.push('s.is_archived = 0');
    if (q) {
      conditions.push("(s.name LIKE ? ESCAPE '\\' OR s.phone LIKE ? ESCAPE '\\')");
      const term = `%${escapeLike(q)}%`;
      params.push(term, term);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = supplierAggregate(where, params);
    const suppliers = rows
      .map((row) => supplierSerial(row))
      .sort((a, b) => Math.abs(b.balance_paise) - Math.abs(a.balance_paise) || a.name.localeCompare(b.name));
    const totalOutstanding = rows.reduce((sum, row) => sum + Math.max(0, row.balance_paise), 0);
    const totalAdvance = rows.reduce((sum, row) => sum + Math.max(0, -row.balance_paise), 0);
    res.json({
      suppliers,
      totalOutstanding,
      totalOutstandingFormatted: paiseToRupees(totalOutstanding),
      totalAdvance,
      count: suppliers.length
    });
  })
);

suppliersRouter.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = supplierBody.parse(req.body);
    const rawOpening = String(data.openingBalance ?? '').trim().replace(/,/g, '');
    const openingPaise = !rawOpening || Number(rawOpening) === 0 ? 0 : parseAmountToPaise(rawOpening);
    const db = getDb();
    const now = nowIso();

    const create = db.transaction(() => {
      const inserted = db
        .prepare(
          `INSERT INTO suppliers (name, phone, address, notes, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(data.name, data.phone || null, data.address || null, data.notes || null, req.user.id, now, now);
      const supplierId = Number(inserted.lastInsertRowid);

      logAudit({
        entityType: 'supplier',
        entityId: supplierId,
        action: 'supplier.created',
        supplierId,
        details: { name: data.name, phone: data.phone, address: data.address, notes: data.notes },
        userId: req.user.id,
        db
      });

      if (openingPaise > 0) {
        insertTransaction(db, {
          supplierId,
          type: 'purchase',
          amountPaise: openingPaise,
          txnDate: pkToday(),
          description: 'Opening balance',
          referenceNo: 'OPENING',
          userId: req.user.id
        });
      }
      return supplierId;
    });

    const supplierId = create();
    const supplier = supplierAggregate('WHERE s.id = ?', [supplierId])[0];
    res.status(201).json({ supplier: supplierSerial(supplier) });
  })
);

suppliersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const supplierId = idSchema.parse(req.params.id);
    const rows = supplierAggregate('WHERE s.id = ?', [supplierId]);
    if (!rows.length) throw new HttpError(404, 'Supplier not found.');
    const supplier = supplierSerial(rows[0]);

    const transactions = getDb()
      .prepare(
        `SELECT t.*, u.display_name AS created_by_name
         FROM transactions t
         LEFT JOIN users u ON u.id = t.created_by
         WHERE t.supplier_id = ?
         ORDER BY t.txn_date ASC, t.created_at ASC, t.id ASC`
      )
      .all(supplierId);

    let running = 0;
    const withBalance = transactions.map((txn) => {
      const effect = transactionSerial(txn).effect_paise;
      running += effect;
      return { ...transactionSerial(txn), balance_after_paise: running };
    });

    res.json({
      supplier,
      transactions: withBalance.reverse(),
      summary: {
        balance: paiseToRupees(supplier.balance_paise),
        balance_paise: supplier.balance_paise,
        purchases: paiseToRupees(supplier.purchases_paise),
        payments: paiseToRupees(supplier.payments_paise),
        transactionCount: supplier.transaction_count
      }
    });
  })
);

suppliersRouter.patch(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const supplierId = idSchema.parse(req.params.id);
    const data = supplierPatch.parse(req.body);
    const keys = Object.keys(data).filter((key) => key !== 'openingBalance');
    if (!keys.length) throw new HttpError(400, 'No changes were provided.');
    const db = getDb();
    const existing = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId);
    if (!existing) throw new HttpError(404, 'Supplier not found.');

    const next = {
      name: data.name ?? existing.name,
      phone: data.phone ?? existing.phone,
      address: data.address ?? existing.address,
      notes: data.notes ?? existing.notes
    };
    const now = nowIso();
    db.transaction(() => {
      db.prepare(
        'UPDATE suppliers SET name = ?, phone = ?, address = ?, notes = ?, updated_at = ? WHERE id = ?'
      ).run(next.name, next.phone || null, next.address || null, next.notes || null, now, supplierId);
      logAudit({
        entityType: 'supplier',
        entityId: supplierId,
        action: 'supplier.updated',
        supplierId,
        details: {
          before: {
            name: existing.name,
            phone: existing.phone,
            address: existing.address,
            notes: existing.notes
          },
          after: next
        },
        userId: req.user.id,
        db
      });
    })();

    const supplier = supplierAggregate('WHERE s.id = ?', [supplierId])[0];
    res.json({ supplier: supplierSerial(supplier) });
  })
);

suppliersRouter.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const supplierId = idSchema.parse(req.params.id);
    const db = getDb();
    const existing = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId);
    if (!existing) throw new HttpError(404, 'Supplier not found.');

    const confirmName = z.string().trim().parse(req.body?.confirmName ?? '');
    if (confirmName.toLocaleLowerCase() !== existing.name.toLocaleLowerCase()) {
      throw new HttpError(400, 'Type the supplier name exactly to confirm deletion.');
    }

    const safety = await createBackup({
      trigger: 'pre-delete',
      note: `Safety backup before deleting supplier #${supplierId} (${existing.name})`,
      userId: req.user.id
    });

    const result = db.transaction(() => {
      const transactionIds = db
        .prepare('SELECT id FROM transactions WHERE supplier_id = ?')
        .all(supplierId)
        .map((row) => row.id);

      if (transactionIds.length) {
        const placeholders = transactionIds.map(() => '?').join(',');
        db.prepare(
          `DELETE FROM audit_logs WHERE supplier_id = ? OR transaction_id IN (${placeholders})`
        ).run(supplierId, ...transactionIds);
        db.prepare('DELETE FROM transactions WHERE supplier_id = ?').run(supplierId);
      } else {
        db.prepare('DELETE FROM audit_logs WHERE supplier_id = ?').run(supplierId);
      }

      db.prepare('DELETE FROM suppliers WHERE id = ?').run(supplierId);

      logAudit({
        entityType: 'supplier',
        entityId: supplierId,
        action: 'supplier.deleted',
        details: {
          supplier: {
            name: existing.name,
            phone: existing.phone,
            address: existing.address,
            notes: existing.notes,
            is_archived: existing.is_archived,
            is_test: existing.is_test,
            created_at: existing.created_at
          },
          transactionsDeleted: transactionIds.length,
          safetyBackup: safety.filename
        },
        userId: req.user.id,
        db
      });

      return { transactionsDeleted: transactionIds.length };
    })();

    res.json({ ok: true, ...result, safetyBackup: safety.filename });
  })
);

suppliersRouter.patch(
  '/:id/archive',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const supplierId = idSchema.parse(req.params.id);
    const data = z.object({ archived: z.boolean() }).parse(req.body);
    const db = getDb();
    const existing = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId);
    if (!existing) throw new HttpError(404, 'Supplier not found.');
    db.transaction(() => {
      db.prepare('UPDATE suppliers SET is_archived = ?, updated_at = ? WHERE id = ?').run(
        data.archived ? 1 : 0,
        nowIso(),
        supplierId
      );
      logAudit({
        entityType: 'supplier',
        entityId: supplierId,
        action: data.archived ? 'supplier.archived' : 'supplier.unarchived',
        supplierId,
        details: { archived: data.archived },
        userId: req.user.id,
        db
      });
    })();
    const supplier = supplierAggregate('WHERE s.id = ?', [supplierId])[0];
    res.json({ supplier: supplierSerial(supplier) });
  })
);
