import express from 'express';
import { z } from 'zod';
import { getDb } from '../db.js';
import { asyncHandler, dateString, HttpError, idSchema, paiseToRupees, pkToday } from '../lib.js';
import {
  getHistory,
  getOutstanding,
  getPaymentReport,
  getStatement,
  reportToCsv,
  reportToPdf,
  resolveRange
} from '../services/reports.js';

export const reportsRouter = express.Router();

const groupBySchema = z.enum(['day', 'month', 'year']).default('day');
const reportSchema = z.enum(['outstanding', 'payments', 'history', 'statement']);
const typeSchema = z.enum(['purchase', 'payment', 'purchase_reversal', 'payment_reversal']).optional();

function assertRange(from, to) {
  if (from > to) throw new HttpError(400, 'The start date cannot be after the end date.');
}

function buildReport(report, query) {
  if (report === 'outstanding') {
    const asOf = query.asOf ? dateString.parse(query.asOf) : pkToday();
    return { data: getOutstanding(asOf), extension: 'Outstanding' };
  }
  if (report === 'statement') {
    const supplierId = idSchema.parse(query.supplierId);
    const { from, to } = resolveRange(query);
    dateString.parse(from);
    dateString.parse(to);
    assertRange(from, to);
    const data = getStatement(supplierId, from, to);
    if (!data) throw new HttpError(404, 'Supplier not found.');
    return { data, extension: `Statement-${data.supplier.name}` };
  }
  const { from, to } = resolveRange(query);
  dateString.parse(from);
  dateString.parse(to);
  assertRange(from, to);
  if (report === 'payments') {
    const groupBy = groupBySchema.parse(query.groupBy || 'day');
    return { data: getPaymentReport(from, to, groupBy), extension: 'Payments' };
  }
  const type = typeSchema.parse(query.type || undefined);
  const supplierId = query.supplierId ? idSchema.parse(query.supplierId) : null;
  return {
    data: getHistory({ from, to, supplierId, type, q: String(query.q || ''), limit: 5000 }),
    extension: 'History'
  };
}

reportsRouter.get(
  '/outstanding',
  asyncHandler(async (req, res) => {
    const asOf = req.query.asOf ? dateString.parse(req.query.asOf) : pkToday();
    res.json(getOutstanding(asOf));
  })
);

reportsRouter.get(
  '/payments',
  asyncHandler(async (req, res) => {
    const { from, to } = resolveRange(req.query);
    dateString.parse(from);
    dateString.parse(to);
    assertRange(from, to);
    const groupBy = groupBySchema.parse(req.query.groupBy || 'day');
    res.json(getPaymentReport(from, to, groupBy));
  })
);

reportsRouter.get(
  '/history',
  asyncHandler(async (req, res) => {
    const { from, to } = resolveRange(req.query);
    dateString.parse(from);
    dateString.parse(to);
    assertRange(from, to);
    const type = typeSchema.parse(req.query.type || undefined);
    const supplierId = req.query.supplierId ? idSchema.parse(req.query.supplierId) : null;
    res.json(getHistory({ from, to, supplierId, type, q: String(req.query.q || ''), limit: 5000 }));
  })
);

reportsRouter.get(
  '/statement/:supplierId',
  asyncHandler(async (req, res) => {
    const supplierId = idSchema.parse(req.params.supplierId);
    const { from, to } = resolveRange(req.query);
    dateString.parse(from);
    dateString.parse(to);
    assertRange(from, to);
    const data = getStatement(supplierId, from, to);
    if (!data) throw new HttpError(404, 'Supplier not found.');
    res.json({
      ...data,
      opening: paiseToRupees(data.opening_paise),
      closing: paiseToRupees(data.closing_paise)
    });
  })
);

reportsRouter.get(
  '/export',
  asyncHandler(async (req, res) => {
    const report = reportSchema.parse(req.query.report);
    const format = z.enum(['csv', 'pdf']).parse(req.query.format);
    const { data } = buildReport(report, req.query);
    const shopName =
      getDb().prepare("SELECT value FROM settings WHERE key = 'shop_name'").get()?.value ||
      'Imran Arain Hisab Kitab';
    const datePart = pkToday();
    const baseName = `Hisab-${report}-${datePart}`.replace(/[^a-zA-Z0-9-_]/g, '-');
    if (format === 'csv') {
      const csv = reportToCsv(report, data);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.csv"`);
      return res.send(csv);
    }
    const pdf = await reportToPdf(report, data, shopName);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.pdf"`);
    return res.send(pdf);
  })
);
