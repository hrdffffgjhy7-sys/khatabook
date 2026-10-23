import express from 'express';
import { z } from 'zod';
import { getDb } from '../db.js';
import { asyncHandler, dateString, getPagination, idSchema, safeJson } from '../lib.js';

export const auditRouter = express.Router();

auditRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = getPagination(req.query, 30);
    const conditions = [];
    const params = [];
    if (req.query.supplierId) {
      conditions.push('a.supplier_id = ?');
      params.push(idSchema.parse(req.query.supplierId));
    }
    if (req.query.action) {
      conditions.push('a.action LIKE ?');
      params.push(`%${String(req.query.action)}%`);
    }
    if (req.query.from) {
      conditions.push('a.created_at >= ?');
      params.push(`${dateString.parse(req.query.from)}T00:00:00.000Z`);
    }
    if (req.query.to) {
      conditions.push('a.created_at < ?');
      const end = new Date(`${dateString.parse(req.query.to)}T00:00:00.000Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      params.push(end.toISOString());
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const db = getDb();
    const total = db.prepare(`SELECT COUNT(*) AS count FROM audit_logs a ${where}`).get(...params).count;
    const rows = db
      .prepare(
        `SELECT a.*, u.display_name AS performed_by_name, s.name AS supplier_name
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.performed_by
         LEFT JOIN suppliers s ON s.id = a.supplier_id
         ${where}
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset)
      .map((row) => ({ ...row, details: safeJson(row.details) }));
    res.json({
      logs: rows,
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
    });
  })
);

auditRouter.get(
  '/transactions/:id',
  asyncHandler(async (req, res) => {
    const transactionId = idSchema.parse(req.params.id);
    const rows = getDb()
      .prepare(
        `SELECT a.*, u.display_name AS performed_by_name
         FROM audit_logs a LEFT JOIN users u ON u.id = a.performed_by
         WHERE a.transaction_id = ? OR (a.entity_type = 'transaction' AND a.entity_id = ?)
         ORDER BY a.created_at ASC, a.id ASC`
      )
      .all(transactionId, transactionId)
      .map((row) => ({ ...row, details: safeJson(row.details) }));
    res.json({ logs: rows });
  })
);
