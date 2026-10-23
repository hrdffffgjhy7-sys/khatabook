import { HttpError, nowIso, signedEffect, transactionEffectSql } from '../lib.js';
import { logAudit } from './audit.js';

export const BALANCE_SQL = `COALESCE(SUM(${transactionEffectSql('t')}), 0)`;

export function getSupplierOrThrow(db, supplierId) {
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId);
  if (!supplier) throw new HttpError(404, 'Supplier not found.');
  return supplier;
}

export function supplierBalance(db, supplierId) {
  return db
    .prepare(`SELECT COALESCE(SUM(${transactionEffectSql('t')}), 0) AS balance FROM transactions t WHERE t.supplier_id = ?`)
    .get(supplierId).balance;
}

export function findIdempotent(db, key) {
  if (!key) return null;
  return db.prepare('SELECT * FROM transactions WHERE idempotency_key = ?').get(key) || null;
}

export function insertTransaction(db, {
  supplierId,
  type,
  amountPaise,
  txnDate,
  description = null,
  referenceNo = null,
  userId = null,
  idempotencyKey = null,
  isTest = 0,
  reversalOfId = null,
  correctsTransactionId = null,
  reversalReason = null
}) {
  if (idempotencyKey) {
    const existing = findIdempotent(db, idempotencyKey);
    if (existing) return { transaction: existing, duplicate: true };
  }

  const supplier = getSupplierOrThrow(db, supplierId);
  if (supplier.is_archived) {
    throw new HttpError(409, 'This supplier is archived. Restore the supplier before adding transactions.');
  }

  const createdAt = nowIso();
  let result;
  try {
    result = db
      .prepare(
        `INSERT INTO transactions
          (supplier_id, type, amount_paise, txn_date, description, reference_no, reversal_of_id,
           corrects_transaction_id, reversal_reason, idempotency_key, is_test, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        supplierId,
        type,
        amountPaise,
        txnDate,
        description,
        referenceNo,
        reversalOfId,
        correctsTransactionId,
        reversalReason,
        idempotencyKey,
        isTest,
        userId,
        createdAt
      );
  } catch (error) {
    if (idempotencyKey && String(error.message).includes('UNIQUE')) {
      const existing = findIdempotent(db, idempotencyKey);
      if (existing) return { transaction: existing, duplicate: true };
    }
    throw error;
  }

  const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);
  logAudit({
    entityType: 'transaction',
    entityId: transaction.id,
    action: 'transaction.created',
    supplierId,
    transactionId: transaction.id,
    reason: reversalReason,
    details: {
      type,
      amountPaise,
      txnDate,
      description,
      referenceNo,
      effectPaise: signedEffect(type, amountPaise),
      reversalOfId,
      correctsTransactionId
    },
    userId,
    db
  });
  return { transaction, duplicate: false };
}
