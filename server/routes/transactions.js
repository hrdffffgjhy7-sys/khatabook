import express from 'express';
import { z } from 'zod';
import { getDb } from '../db.js';
import {
  asyncHandler,
  dateString,
  escapeLike,
  HttpError,
  idSchema,
  getPagination,
  nowIso,
  parseAmountToPaise,
  paiseToRupees,
  pkToday,
  transactionSerial
} from '../lib.js';
import { logAudit } from '../services/audit.js';
import { findIdempotent, insertTransaction } from '../services/transactions.js';
import { requireAdmin } from '../middleware/auth.js';

export const transactionsRouter = express.Router();

const transactionBase = z.object({
  supplierId: idSchema,
  type: z.enum(['purchase', 'payment']),
  amount: z.union([z.string(), z.number()]),
  date: dateString.optional(),
  description: z.string().trim().max(1000).optional().default(''),
  referenceNo: z.string().trim().max(100).optional().default(''),
  idempotencyKey: z.string().trim().min(8).max(100).optional()
});

const correctionSchema = transactionBase.omit({ supplierId: true }).extend({
  reason: z.string().trim().min(3, 'Please provide a correction reason.').max(500)
});

const reversalSchema = z.object({
  reason: z.string().trim().min(3, 'Please provide a reversal reason.').max(500),
  date: dateString.optional(),
  idempotencyKey: z.string().trim().min(8).max(100).optional()
});

const oppositeType = (type) => (type === 'purchase' ? 'purchase_reversal' : 'payment_reversal');

function normalizeOptional(value) {
  const text = String(value || '').trim();
  return text || null;
}

transactionsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = getPagination(req.query);
    const conditions = [];
    const params = [];

    if (req.query.supplierId) {
      conditions.push('t.supplier_id = ?');
      params.push(idSchema.parse(req.query.supplierId));
    }
    if (req.query.type && req.query.type !== 'all') {
      const type = z.enum(['purchase', 'payment', 'purchase_reversal', 'payment_reversal']).parse(req.query.type);
      conditions.push('t.type = ?');
      params.push(type);
    }
    if (req.query.from) {
      conditions.push('t.txn_date >= ?');
      params.push(dateString.parse(req.query.from));
    }
    if (req.query.to) {
      conditions.push('t.txn_date <= ?');
      params.push(dateString.parse(req.query.to));
    }
    if (req.query.status && req.query.status !== 'all') {
      const status = z.enum(['active', 'reversed']).parse(req.query.status);
      conditions.push('t.status = ?');
      params.push(status);
    }
    if (req.query.q) {
      conditions.push(
        "(s.name LIKE ? ESCAPE '\\' OR COALESCE(t.description, '') LIKE ? ESCAPE '\\' OR COALESCE(t.reference_no, '') LIKE ? ESCAPE '\\')"
      );
      const term = `%${escapeLike(String(req.query.q).trim())}%`;
      params.push(term, term, term);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const db = getDb();
    const total = db
      .prepare(`SELECT COUNT(*) AS count FROM transactions t JOIN suppliers s ON s.id = t.supplier_id ${where}`)
      .get(...params).count;
    const totals = db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN t.type = 'purchase' THEN t.amount_paise
            WHEN t.type = 'purchase_reversal' THEN -t.amount_paise ELSE 0 END), 0) AS purchases_paise,
          COALESCE(SUM(CASE WHEN t.type = 'payment' THEN t.amount_paise
            WHEN t.type = 'payment_reversal' THEN -t.amount_paise ELSE 0 END), 0) AS payments_paise
         FROM transactions t JOIN suppliers s ON s.id = t.supplier_id ${where}`
      )
      .get(...params);

    const rows = db
      .prepare(
        `SELECT t.*, s.name AS supplier_name, s.phone AS supplier_phone, u.display_name AS created_by_name
         FROM transactions t
         JOIN suppliers s ON s.id = t.supplier_id
         LEFT JOIN users u ON u.id = t.created_by
         ${where}
         ORDER BY t.txn_date DESC, t.created_at DESC, t.id DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset);

    res.json({
      transactions: rows.map(transactionSerial),
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
      totals: {
        purchases: paiseToRupees(totals.purchases_paise),
        purchases_paise: totals.purchases_paise,
        payments: paiseToRupees(totals.payments_paise),
        payments_paise: totals.payments_paise
      }
    });
  })
);

transactionsRouter.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = transactionBase.parse(req.body);
    const amountPaise = parseAmountToPaise(data.amount);
    const db = getDb();
    if (data.idempotencyKey) {
      const duplicate = findIdempotent(db, data.idempotencyKey);
      if (duplicate) {
        return res.status(200).json({ transaction: transactionSerial(duplicate), duplicate: true });
      }
    }

    const result = db.transaction(() =>
      insertTransaction(db, {
        supplierId: data.supplierId,
        type: data.type,
        amountPaise,
        txnDate: data.date || pkToday(),
        description: normalizeOptional(data.description),
        referenceNo: normalizeOptional(data.referenceNo),
        userId: req.user.id,
        idempotencyKey: data.idempotencyKey || null
      })
    )();

    res.status(result.duplicate ? 200 : 201).json({
      transaction: transactionSerial(result.transaction),
      duplicate: result.duplicate
    });
  })
);

transactionsRouter.post(
  '/:id/reverse',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const transactionId = idSchema.parse(req.params.id);
    const data = reversalSchema.parse(req.body);
    const db = getDb();
    if (data.idempotencyKey) {
      const duplicate = findIdempotent(db, data.idempotencyKey);
      if (duplicate) return res.json({ transaction: transactionSerial(duplicate), duplicate: true });
    }

    const original = db.prepare('SELECT * FROM transactions WHERE id = ?').get(transactionId);
    if (!original) throw new HttpError(404, 'Transaction not found.');
    if (!['purchase', 'payment'].includes(original.type)) {
      throw new HttpError(409, 'Reversal entries cannot be reversed.');
    }
    if (original.status === 'reversed') {
      throw new HttpError(409, 'This transaction has already been reversed.');
    }
    const today = data.date || pkToday();

    const run = db.transaction(() => {
      const reversal = db
        .prepare(
          `INSERT INTO transactions
            (supplier_id, type, amount_paise, txn_date, description, reference_no, reversal_of_id,
             reversal_reason, idempotency_key, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          original.supplier_id,
          oppositeType(original.type),
          original.amount_paise,
          today,
          `Reversal of transaction #${original.id}`,
          original.reference_no,
          original.id,
          data.reason,
          data.idempotencyKey || null,
          req.user.id,
          nowIso()
        );
      const reversalId = Number(reversal.lastInsertRowid);
      db.prepare(
        'UPDATE transactions SET status = ?, reversed_by_id = ?, reversal_reason = ? WHERE id = ?'
      ).run('reversed', reversalId, data.reason, original.id);

      logAudit({
        entityType: 'transaction',
        entityId: original.id,
        action: 'transaction.reversed',
        supplierId: original.supplier_id,
        transactionId: reversalId,
        reason: data.reason,
        details: {
          original: {
            id: original.id,
            type: original.type,
            amountPaise: original.amount_paise,
            txnDate: original.txn_date,
            description: original.description
          },
          reversalId
        },
        userId: req.user.id,
        db
      });

      return db.prepare('SELECT * FROM transactions WHERE id = ?').get(reversalId);
    });

    const reversal = run();
    res.status(201).json({ transaction: transactionSerial(reversal) });
  })
);

transactionsRouter.post(
  '/:id/correct',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const transactionId = idSchema.parse(req.params.id);
    const data = correctionSchema.parse(req.body);
    const amountPaise = parseAmountToPaise(data.amount);
    const db = getDb();

    if (data.idempotencyKey) {
      const replacement = findIdempotent(db, `${data.idempotencyKey}:replacement`);
      if (replacement) {
        return res.json({
          transaction: transactionSerial(replacement),
          duplicate: true
        });
      }
    }

    const original = db.prepare('SELECT * FROM transactions WHERE id = ?').get(transactionId);
    if (!original) throw new HttpError(404, 'Transaction not found.');
    if (!['purchase', 'payment'].includes(original.type)) {
      throw new HttpError(409, 'Reversal entries cannot be corrected.');
    }
    if (original.status === 'reversed') {
      throw new HttpError(409, 'This transaction has already been reversed.');
    }

    const txnDate = data.date || original.txn_date;
    const replacementKey = data.idempotencyKey ? `${data.idempotencyKey}:replacement` : null;
    const reversalKey = data.idempotencyKey ? `${data.idempotencyKey}:reversal` : null;

    const run = db.transaction(() => {
      const reversal = db
        .prepare(
          `INSERT INTO transactions
            (supplier_id, type, amount_paise, txn_date, description, reference_no, reversal_of_id,
             reversal_reason, idempotency_key, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          original.supplier_id,
          oppositeType(original.type),
          original.amount_paise,
          pkToday(),
          `Correction reversal of transaction #${original.id}`,
          original.reference_no,
          original.id,
          data.reason,
          reversalKey,
          req.user.id,
          nowIso()
        );
      const reversalId = Number(reversal.lastInsertRowid);
      db.prepare(
        'UPDATE transactions SET status = ?, reversed_by_id = ?, reversal_reason = ? WHERE id = ?'
      ).run('reversed', reversalId, data.reason, original.id);

      const replacement = db
        .prepare(
          `INSERT INTO transactions
            (supplier_id, type, amount_paise, txn_date, description, reference_no,
             corrects_transaction_id, idempotency_key, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          original.supplier_id,
          data.type,
          amountPaise,
          txnDate,
          normalizeOptional(data.description),
          normalizeOptional(data.referenceNo),
          original.id,
          replacementKey,
          req.user.id,
          nowIso()
        );
      const replacementId = Number(replacement.lastInsertRowid);
      const replacementRow = db.prepare('SELECT * FROM transactions WHERE id = ?').get(replacementId);

      logAudit({
        entityType: 'transaction',
        entityId: original.id,
        action: 'transaction.corrected',
        supplierId: original.supplier_id,
        transactionId: replacementId,
        reason: data.reason,
        details: {
          before: {
            id: original.id,
            type: original.type,
            amountPaise: original.amount_paise,
            txnDate: original.txn_date,
            description: original.description,
            referenceNo: original.reference_no
          },
          after: {
            id: replacementId,
            type: data.type,
            amountPaise,
            txnDate,
            description: normalizeOptional(data.description),
            referenceNo: normalizeOptional(data.referenceNo)
          },
          reversalId
        },
        userId: req.user.id,
        db
      });

      return replacementRow;
    });

    const replacement = run();
    res.status(201).json({ transaction: transactionSerial(replacement) });
  })
);
