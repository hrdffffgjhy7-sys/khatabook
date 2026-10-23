import { getDb } from './db.js';
import { nowIso, pkToday } from './lib.js';
import { logAudit } from './services/audit.js';
import { insertTransaction } from './services/transactions.js';
import { userCount } from './services/auth.js';

const db = getDb();

if (db.prepare('SELECT COUNT(*) AS count FROM suppliers WHERE is_test = 1').get().count > 0) {
  console.log('Test data already exists. Nothing was added.');
  process.exit(0);
}

function daysAgo(days) {
  const [year, month, day] = pkToday().split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day - days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

const admin = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get();
const userId = userCount() ? admin.id : null;

const samples = [
  {
    name: 'Al-Karam Traders (TEST)',
    phone: '0300-1234567',
    address: 'Grain Market, Karachi',
    notes: 'Sample supplier for testing. Safe to remove.',
    transactions: [
      { type: 'purchase', amountPaise: 10000000, date: daysAgo(30), description: 'Initial credit purchase', referenceNo: 'BILL-1001' },
      { type: 'payment', amountPaise: 500000, date: daysAgo(20), description: 'Cash payment', referenceNo: 'RCPT-101' },
      { type: 'payment', amountPaise: 1000000, date: daysAgo(7), description: 'Bank transfer', referenceNo: 'BANK-5502' }
    ]
  },
  {
    name: 'Rehman Wholesale (TEST)',
    phone: '0321-7654321',
    address: 'Jodia Bazaar, Karachi',
    notes: 'Fully paid sample account.',
    transactions: [
      { type: 'purchase', amountPaise: 5000000, date: daysAgo(25), description: 'Rice and flour stock', referenceNo: 'BILL-2044' },
      { type: 'payment', amountPaise: 5000000, date: daysAgo(10), description: 'Full settlement', referenceNo: 'RCPT-205' }
    ]
  },
  {
    name: 'City Foods (TEST)',
    phone: '0333-1122334',
    address: 'Saddar, Karachi',
    notes: 'Sample partial payment account.',
    transactions: [
      { type: 'purchase', amountPaise: 3500000, date: daysAgo(15), description: 'Beverages and packaged food', referenceNo: 'BILL-3301' },
      { type: 'payment', amountPaise: 1000000, date: daysAgo(5), description: 'Cheque payment', referenceNo: 'CHQ-8890' }
    ]
  }
];

const seed = db.transaction(() => {
  for (const sample of samples) {
    const now = nowIso();
    const inserted = db
      .prepare(
        `INSERT INTO suppliers (name, phone, address, notes, is_test, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?)`
      )
      .run(sample.name, sample.phone, sample.address, sample.notes, userId, now, now);
    const supplierId = Number(inserted.lastInsertRowid);
    logAudit({
      entityType: 'supplier',
      entityId: supplierId,
      action: 'supplier.created',
      supplierId,
      details: { name: sample.name, isTest: true },
      userId,
      db
    });
    for (const txn of sample.transactions) {
      insertTransaction(db, {
        supplierId,
        type: txn.type,
        amountPaise: txn.amountPaise,
        txnDate: txn.date,
        description: txn.description,
        referenceNo: txn.referenceNo,
        userId,
        isTest: 1
      });
    }
  }
});

seed();
console.log(`Added ${samples.length} test suppliers with sample transactions.`);
console.log('Remove them from Settings > Test data, or run the delete action in the app.');
