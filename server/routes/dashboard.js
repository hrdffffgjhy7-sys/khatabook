import express from 'express';
import { getDb } from '../db.js';
import { asyncHandler, paiseToRupees, pkToday, transactionEffectSql, transactionSerial } from '../lib.js';

export const dashboardRouter = express.Router();

function monthKeys(count) {
  const today = pkToday();
  const [year, month] = today.split('-').map(Number);
  const keys = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(Date.UTC(year, month - 1 - index, 1));
    keys.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

dashboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const db = getDb();
    const supplierRows = db
      .prepare(
        `SELECT s.id, s.name, s.phone,
          COALESCE(SUM(${transactionEffectSql('t')}), 0) AS balance_paise
         FROM suppliers s
         LEFT JOIN transactions t ON t.supplier_id = s.id
         WHERE s.is_archived = 0
         GROUP BY s.id`
      )
      .all();

    const outstandingPaise = supplierRows.reduce((sum, row) => sum + Math.max(0, row.balance_paise), 0);
    const advancePaise = supplierRows.reduce((sum, row) => sum + Math.max(0, -row.balance_paise), 0);

    const totals = db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN type = 'purchase' THEN amount_paise
            WHEN type = 'purchase_reversal' THEN -amount_paise ELSE 0 END), 0) AS purchases_paise,
          COALESCE(SUM(CASE WHEN type = 'payment' THEN amount_paise
            WHEN type = 'payment_reversal' THEN -amount_paise ELSE 0 END), 0) AS payments_paise,
          COUNT(*) AS transaction_count
         FROM transactions`
      )
      .get();

    const recent = db
      .prepare(
        `SELECT t.*, s.name AS supplier_name, s.phone AS supplier_phone
         FROM transactions t
         JOIN suppliers s ON s.id = t.supplier_id
         ORDER BY t.txn_date DESC, t.created_at DESC, t.id DESC
         LIMIT 8`
      )
      .all()
      .map(transactionSerial);

    const keys = monthKeys(6);
    const firstMonth = keys[0];
    const monthly = db
      .prepare(
        `SELECT substr(txn_date, 1, 7) AS month,
          COALESCE(SUM(CASE WHEN type = 'purchase' THEN amount_paise
            WHEN type = 'purchase_reversal' THEN -amount_paise ELSE 0 END), 0) AS purchases_paise,
          COALESCE(SUM(CASE WHEN type = 'payment' THEN amount_paise
            WHEN type = 'payment_reversal' THEN -amount_paise ELSE 0 END), 0) AS payments_paise
         FROM transactions
         WHERE substr(txn_date, 1, 7) >= ?
         GROUP BY substr(txn_date, 1, 7)`
      )
      .all(firstMonth);
    const monthMap = new Map(monthly.map((row) => [row.month, row]));
    const trend = keys.map((month) => {
      const row = monthMap.get(month) || { purchases_paise: 0, payments_paise: 0 };
      return {
        month,
        purchases_paise: row.purchases_paise,
        purchases: paiseToRupees(row.purchases_paise),
        payments_paise: row.payments_paise,
        payments: paiseToRupees(row.payments_paise)
      };
    });

    const topSuppliers = supplierRows
      .filter((row) => row.balance_paise > 0)
      .sort((a, b) => b.balance_paise - a.balance_paise)
      .slice(0, 5)
      .map((row) => ({
        id: row.id,
        name: row.name,
        phone: row.phone,
        balance_paise: row.balance_paise,
        balance: paiseToRupees(row.balance_paise)
      }));

    const lastBackup = db
      .prepare("SELECT * FROM backups WHERE status = 'success' ORDER BY created_at DESC LIMIT 1")
      .get();

    res.json({
      summary: {
        outstanding: paiseToRupees(outstandingPaise),
        outstanding_paise: outstandingPaise,
        advance: paiseToRupees(advancePaise),
        advance_paise: advancePaise,
        purchases: paiseToRupees(totals.purchases_paise),
        purchases_paise: totals.purchases_paise,
        payments: paiseToRupees(totals.payments_paise),
        payments_paise: totals.payments_paise,
        supplierCount: supplierRows.length,
        transactionCount: totals.transaction_count,
        lastBackup: lastBackup
          ? {
              createdAt: lastBackup.created_at,
              trigger: lastBackup.trigger_type,
              filename: lastBackup.filename
            }
          : null
      },
      recentTransactions: recent,
      trend,
      topSuppliers
    });
  })
);
