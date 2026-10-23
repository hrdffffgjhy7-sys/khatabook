import { getDb } from '../db.js';
import { nowIso } from '../lib.js';

export function logAudit({
  entityType,
  entityId = null,
  action,
  supplierId = null,
  transactionId = null,
  reason = null,
  details = null,
  userId = null,
  db = null
}) {
  const database = db || getDb();
  database
    .prepare(
      `INSERT INTO audit_logs
        (entity_type, entity_id, action, supplier_id, transaction_id, reason, details, performed_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      entityType,
      entityId,
      action,
      supplierId,
      transactionId,
      reason,
      details ? JSON.stringify(details) : null,
      userId,
      nowIso()
    );
}
