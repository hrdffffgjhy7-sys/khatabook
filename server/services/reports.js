import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { config } from '../config.js';
import { getDb } from '../db.js';
import {
  paiseToRupees,
  pkDateTime,
  pkToday,
  transactionEffectSql,
  transactionSerial
} from '../lib.js';

const TXN_LABELS = {
  purchase: 'Credit purchase',
  payment: 'Payment',
  purchase_reversal: 'Purchase reversal',
  payment_reversal: 'Payment reversal'
};

export function resolveRange(query) {
  const today = pkToday();
  const from = query.from || `${today.slice(0, 7)}-01`;
  const to = query.to || today;
  return { from, to };
}

export function getOutstanding(asOf = pkToday()) {
  const rows = getDb()
    .prepare(
      `SELECT s.id, s.name, s.phone, s.address, s.is_archived,
        COALESCE(SUM(${transactionEffectSql('t')}), 0) AS balance_paise,
        COALESCE(SUM(CASE WHEN t.type = 'purchase' THEN t.amount_paise
          WHEN t.type = 'purchase_reversal' THEN -t.amount_paise ELSE 0 END), 0) AS purchases_paise,
        COALESCE(SUM(CASE WHEN t.type = 'payment' THEN t.amount_paise
          WHEN t.type = 'payment_reversal' THEN -t.amount_paise ELSE 0 END), 0) AS payments_paise
       FROM suppliers s
       LEFT JOIN transactions t ON t.supplier_id = s.id AND t.txn_date <= ?
       GROUP BY s.id
       ORDER BY balance_paise DESC, s.name COLLATE NOCASE`
    )
    .all(asOf)
    .map((row) => ({
      ...row,
      balance: paiseToRupees(row.balance_paise),
      purchases: paiseToRupees(row.purchases_paise),
      payments: paiseToRupees(row.payments_paise)
    }));
  const totals = {
    outstanding_paise: rows.reduce((sum, row) => sum + Math.max(0, row.balance_paise), 0),
    advance_paise: rows.reduce((sum, row) => sum + Math.max(0, -row.balance_paise), 0),
    purchases_paise: rows.reduce((sum, row) => sum + row.purchases_paise, 0),
    payments_paise: rows.reduce((sum, row) => sum + row.payments_paise, 0)
  };
  return { asOf, rows, totals };
}

export function getPaymentReport(from, to, groupBy = 'day') {
  const expressions = {
    day: "substr(txn_date, 1, 10)",
    month: "substr(txn_date, 1, 7)",
    year: "substr(txn_date, 1, 4)"
  };
  const expression = expressions[groupBy] || expressions.day;
  const rows = getDb()
    .prepare(
      `SELECT ${expression} AS period,
        COALESCE(SUM(CASE WHEN type = 'purchase' THEN amount_paise
          WHEN type = 'purchase_reversal' THEN -amount_paise ELSE 0 END), 0) AS purchases_paise,
        COALESCE(SUM(CASE WHEN type = 'payment' THEN amount_paise
          WHEN type = 'payment_reversal' THEN -amount_paise ELSE 0 END), 0) AS payments_paise,
        COUNT(*) AS transaction_count
       FROM transactions
       WHERE txn_date BETWEEN ? AND ?
       GROUP BY period
       ORDER BY period`
    )
    .all(from, to)
    .map((row) => ({
      ...row,
      purchases: paiseToRupees(row.purchases_paise),
      payments: paiseToRupees(row.payments_paise)
    }));
  return {
    from,
    to,
    groupBy,
    rows,
    totals: {
      purchases_paise: rows.reduce((sum, row) => sum + row.purchases_paise, 0),
      payments_paise: rows.reduce((sum, row) => sum + row.payments_paise, 0)
    }
  };
}

export function getHistory({ from, to, supplierId = null, type = null, q = '', limit = 5000 }) {
  const conditions = ['t.txn_date BETWEEN ? AND ?'];
  const params = [from, to];
  if (supplierId) {
    conditions.push('t.supplier_id = ?');
    params.push(supplierId);
  }
  if (type && type !== 'all') {
    conditions.push('t.type = ?');
    params.push(type);
  }
  if (q) {
    conditions.push("(s.name LIKE ? OR COALESCE(t.description, '') LIKE ? OR COALESCE(t.reference_no, '') LIKE ?)");
    const term = `%${q}%`;
    params.push(term, term, term);
  }
  const rows = getDb()
    .prepare(
      `SELECT t.*, s.name AS supplier_name, s.phone AS supplier_phone, u.display_name AS created_by_name
       FROM transactions t
       JOIN suppliers s ON s.id = t.supplier_id
       LEFT JOIN users u ON u.id = t.created_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.txn_date ASC, t.created_at ASC, t.id ASC
       LIMIT ?`
    )
    .all(...params, Math.min(5000, Math.max(1, limit)))
    .map(transactionSerial);
  return { from, to, rows };
}

export function getStatement(supplierId, from, to) {
  const db = getDb();
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId);
  if (!supplier) return null;
  const opening = db
    .prepare(
      `SELECT COALESCE(SUM(${transactionEffectSql('t')}), 0) AS balance
       FROM transactions t WHERE t.supplier_id = ? AND t.txn_date < ?`
    )
    .get(supplierId, from).balance;
  const transactions = db
    .prepare(
      `SELECT t.*, u.display_name AS created_by_name
       FROM transactions t LEFT JOIN users u ON u.id = t.created_by
       WHERE t.supplier_id = ? AND t.txn_date BETWEEN ? AND ?
       ORDER BY t.txn_date ASC, t.created_at ASC, t.id ASC`
    )
    .all(supplierId, from, to)
    .map(transactionSerial);

  let running = opening;
  const rows = transactions.map((txn) => {
    running += txn.effect_paise;
    return { ...txn, balance_after_paise: running };
  });
  return {
    supplier,
    from,
    to,
    opening_paise: opening,
    closing_paise: running,
    rows
  };
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function money(paise) {
  return (Number(paise || 0) / 100).toFixed(2);
}

export function reportToCsv(report, data) {
  const lines = [];
  if (report === 'outstanding') {
    lines.push(['Supplier', 'Phone', 'Address', 'Purchases (PKR)', 'Payments (PKR)', 'Outstanding (PKR)']);
    for (const row of data.rows) {
      lines.push([row.name, row.phone || '', row.address || '', money(row.purchases_paise), money(row.payments_paise), money(row.balance_paise)]);
    }
    lines.push([]);
    lines.push(['Total Outstanding', '', '', money(data.totals.purchases_paise), money(data.totals.payments_paise), money(data.totals.outstanding_paise)]);
  } else if (report === 'payments') {
    lines.push(['Period', 'Purchases (PKR)', 'Payments (PKR)', 'Transactions']);
    for (const row of data.rows) {
      lines.push([row.period, money(row.purchases_paise), money(row.payments_paise), row.transaction_count]);
    }
    lines.push([]);
    lines.push(['Total', money(data.totals.purchases_paise), money(data.totals.payments_paise), '']);
  } else if (report === 'history') {
    lines.push(['Date', 'Supplier', 'Type', 'Description', 'Reference', 'Purchase (PKR)', 'Payment (PKR)', 'Status']);
    for (const row of data.rows) {
      lines.push([
        row.txn_date,
        row.supplier_name,
        TXN_LABELS[row.type] || row.type,
        row.description || '',
        row.reference_no || '',
        row.type === 'purchase' || row.type === 'purchase_reversal' ? money(row.effect_paise > 0 ? row.amount_paise : -row.amount_paise) : '',
        row.type === 'payment' || row.type === 'payment_reversal' ? money(row.effect_paise < 0 ? row.amount_paise : -row.amount_paise) : '',
        row.status
      ]);
    }
  } else if (report === 'statement') {
    lines.push(['Supplier statement', data.supplier.name]);
    lines.push(['Phone', data.supplier.phone || '', 'Period', `${data.from} to ${data.to}`]);
    lines.push(['Opening balance (PKR)', money(data.opening_paise)]);
    lines.push([]);
    lines.push(['Date', 'Type', 'Description', 'Reference', 'Purchase (PKR)', 'Payment (PKR)', 'Balance (PKR)', 'Status', 'Reversal reason']);
    for (const row of data.rows) {
      lines.push([
        row.txn_date,
        TXN_LABELS[row.type] || row.type,
        row.description || '',
        row.reference_no || '',
        row.effect_paise > 0 ? money(row.amount_paise) : '',
        row.effect_paise < 0 ? money(row.amount_paise) : '',
        money(row.balance_after_paise),
        row.status,
        row.reversal_reason || ''
      ]);
    }
    lines.push([]);
    lines.push(['Closing balance (PKR)', money(data.closing_paise)]);
  }
  return `\uFEFF${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

function isUrdu(text) {
  return /[\u0600-\u06FF\u0750-\u077F]/.test(String(text || ''));
}

export async function reportToPdf(report, data, shopName) {
  const fontPath = path.join(config.rootDir, 'server', 'assets', 'fonts', 'NotoNaskhArabic-Regular.ttf');
  const hasUrduFont = fs.existsSync(fontPath);

  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, info: { Title: `Imran Arain Hisab Kitab - ${report}` } });
  if (hasUrduFont) doc.registerFont('Urdu', fontPath);

  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const finished = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const pageWidth = doc.page.width - 80;
  const green = '#065f46';
  const lightGreen = '#ecfdf5';
  const gray = '#64748b';
  const dark = '#0f172a';
  const red = '#b91c1c';

  const useFont = (text, size = 9, bold = false) => {
    if (hasUrduFont && isUrdu(text)) doc.font('Urdu').fontSize(size);
    else doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
  };

  function pageHeader(title, subtitle = '') {
    doc.rect(0, 0, doc.page.width, 92).fill(green);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18).text(shopName || 'Imran Arain Hisab Kitab', 40, 26, { width: pageWidth });
    doc.font('Helvetica').fontSize(9).fillColor('#d1fae5').text('Supplier credit & payment accounting', 40, 50);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#ffffff').text(title, 40, 68, { width: pageWidth, align: 'right' });
    if (subtitle) {
      doc.font('Helvetica').fontSize(8).fillColor('#d1fae5').text(subtitle, 40, 68, { width: pageWidth, align: 'left' });
    }
    doc.fillColor(dark);
    return 112;
  }

  function table(title, columns, rows, totals = null) {
    let y = pageHeader(title, `Generated: ${pkDateTime(new Date())} (Asia/Karachi)`);
    doc.fillColor(dark).font('Helvetica-Bold').fontSize(14).text(title, 40, y);
    y += 22;

    const drawHeader = () => {
      doc.rect(40, y, pageWidth, 22).fill(lightGreen);
      let x = 40;
      columns.forEach((column) => {
        useFont(column.label, 8, true);
        doc.fillColor(green).text(column.label, x + 4, y + 7, {
          width: column.width - 8,
          align: column.align || 'left',
          lineBreak: false,
          ellipsis: true
        });
        x += column.width;
      });
      y += 22;
    };

    drawHeader();
    doc.font('Helvetica').fontSize(8);
    rows.forEach((row, index) => {
      if (y > doc.page.height - 72) {
        doc.addPage();
        y = pageHeader(title, 'Continued');
        drawHeader();
      }
      if (index % 2 === 0) doc.rect(40, y, pageWidth, 20).fill('#f8fafc');
      let x = 40;
      columns.forEach((column) => {
        const value = row[column.key] ?? '';
        useFont(value, 8, false);
        doc
          .fillColor(column.color ? column.color(row) : dark)
          .text(String(value), x + 4, y + 6, {
            width: column.width - 8,
            align: column.align || 'left',
            lineBreak: false,
            ellipsis: true
          });
        x += column.width;
      });
      y += 20;
    });

    if (totals) {
      if (y > doc.page.height - 72) {
        doc.addPage();
        y = pageHeader(title, 'Continued');
        drawHeader();
      }
      doc.rect(40, y, pageWidth, 24).fill('#e2e8f0');
      let x = 40;
      columns.forEach((column) => {
        const value = totals[column.key] ?? '';
        useFont(value, 8, true);
        doc.fillColor(dark).text(String(value), x + 4, y + 8, {
          width: column.width - 8,
          align: column.align || 'left',
          lineBreak: false,
          ellipsis: true
        });
        x += column.width;
      });
      y += 24;
    }

    if (!rows.length) {
      doc.fillColor(gray).font('Helvetica').fontSize(10).text('No records found for this period.', 40, y + 18);
    }
    return y + 24;
  }

  if (report === 'outstanding') {
    table(
      'Supplier Outstanding Report',
      [
        { key: 'name', label: 'Supplier', width: 175 },
        { key: 'phone', label: 'Phone', width: 95 },
        { key: 'purchases', label: 'Purchases', width: 80, align: 'right' },
        { key: 'payments', label: 'Payments', width: 80, align: 'right' },
        { key: 'balance', label: 'Outstanding', width: 85, align: 'right', color: (row) => (row.balance_paise > 0 ? red : '#047857') }
      ],
      data.rows.map((row) => ({
        name: row.name,
        phone: row.phone || '',
        purchases: money(row.purchases_paise),
        payments: money(row.payments_paise),
        balance: money(row.balance_paise),
        balance_paise: row.balance_paise
      })),
      {
        name: 'TOTAL',
        phone: '',
        purchases: money(data.totals.purchases_paise),
        payments: money(data.totals.payments_paise),
        balance: money(data.totals.outstanding_paise)
      }
    );
    doc.fillColor(gray).font('Helvetica').fontSize(8).text(`Outstanding as of ${data.asOf} (Asia/Karachi). Amounts in PKR.`, 40, doc.y, { width: pageWidth });
  } else if (report === 'payments') {
    table(
      'Purchase & Payment Report',
      [
        { key: 'period', label: 'Period', width: 185 },
        { key: 'purchases', label: 'Purchases (PKR)', width: 110, align: 'right' },
        { key: 'payments', label: 'Payments (PKR)', width: 110, align: 'right' },
        { key: 'count', label: 'Entries', width: 110, align: 'right' }
      ],
      data.rows.map((row) => ({
        period: row.period,
        purchases: money(row.purchases_paise),
        payments: money(row.payments_paise),
        count: row.transaction_count
      })),
      {
        period: `TOTAL (${data.from} to ${data.to})`,
        purchases: money(data.totals.purchases_paise),
        payments: money(data.totals.payments_paise),
        count: ''
      }
    );
  } else if (report === 'history') {
    table(
      'Purchase & Payment History',
      [
        { key: 'date', label: 'Date', width: 62 },
        { key: 'supplier', label: 'Supplier', width: 120 },
        { key: 'type', label: 'Type', width: 95 },
        { key: 'description', label: 'Description', width: 110 },
        { key: 'debit', label: 'Purchase', width: 64, align: 'right' },
        { key: 'credit', label: 'Payment', width: 64, align: 'right' }
      ],
      data.rows.map((row) => ({
        date: row.txn_date,
        supplier: row.supplier_name,
        type: TXN_LABELS[row.type] || row.type,
        description: row.description || row.reference_no || '',
        debit: row.effect_paise > 0 ? money(row.amount_paise) : '',
        credit: row.effect_paise < 0 ? money(row.amount_paise) : ''
      }))
    );
    doc.fillColor(gray).font('Helvetica').fontSize(8).text(`Date range: ${data.from} to ${data.to}. Amounts in PKR.`, 40, doc.y, { width: pageWidth });
  } else if (report === 'statement') {
    const title = `Account Statement - ${data.supplier.name}`;
    let y = pageHeader('Supplier Account Statement', `${data.from} to ${data.to}`);
    useFont(data.supplier.name, 15, true);
    doc.fillColor(dark).text(data.supplier.name, 40, y, { width: pageWidth });
    y += 22;
    doc.font('Helvetica').fontSize(9).fillColor(gray);
    if (data.supplier.phone) doc.text(`Phone: ${data.supplier.phone}`, 40, y);
    doc.text(`Opening balance: PKR ${money(data.opening_paise)}`, 40, y, { width: pageWidth, align: 'right' });
    y += 18;
    if (data.supplier.address) {
      useFont(data.supplier.address, 9);
      doc.fillColor(gray).text(data.supplier.address, 40, y, { width: pageWidth });
      y += 14;
    }
    doc.y = y + 6;
    table(
      'Supplier Account Statement',
      [
        { key: 'date', label: 'Date', width: 62 },
        { key: 'type', label: 'Type', width: 92 },
        { key: 'description', label: 'Description', width: 125 },
        { key: 'debit', label: 'Purchase', width: 68, align: 'right' },
        { key: 'credit', label: 'Payment', width: 68, align: 'right' },
        { key: 'balance', label: 'Balance', width: 100, align: 'right' }
      ],
      data.rows.map((row) => ({
        date: row.txn_date,
        type: TXN_LABELS[row.type] || row.type,
        description: row.description || row.reference_no || '',
        debit: row.effect_paise > 0 ? money(row.amount_paise) : '',
        credit: row.effect_paise < 0 ? money(row.amount_paise) : '',
        balance: money(row.balance_after_paise),
        balance_paise: row.balance_after_paise
      })),
      {
        date: 'CLOSING',
        type: '',
        description: 'Balance after statement period',
        debit: '',
        credit: '',
        balance: money(data.closing_paise)
      }
    );
  }

  const pageRange = doc.bufferedPageRange();
  for (let index = 0; index < pageRange.count; index += 1) {
    doc.switchToPage(index);
    doc.font('Helvetica').fontSize(7).fillColor('#94a3b8').text(
      `Imran Arain Hisab Kitab  |  Page ${index + 1} of ${pageRange.count}  |  Generated ${pkDateTime(new Date())}`,
      40,
      doc.page.height - 28,
      { width: pageWidth, align: 'center' }
    );
  }

  doc.end();
  return finished;
}
