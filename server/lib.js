import { z } from 'zod';

export class HttpError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export const nowIso = () => new Date().toISOString();

export function pkToday(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

export function pkDateTime(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(date);
}

export function pkParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function parseAmountToPaise(input) {
  if (input === null || input === undefined) {
    throw new HttpError(400, 'Amount is required.');
  }
  let text = String(input).trim().replace(/,/g, '').replace(/^rs\.?\s*/i, '');
  if (!text) throw new HttpError(400, 'Amount is required.');
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(text)) {
    throw new HttpError(400, 'Amount must be a positive number with at most 2 decimal places.');
  }
  const [whole, fraction = ''] = text.split('.');
  const paise = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  if (!Number.isSafeInteger(paise) || paise <= 0) {
    throw new HttpError(400, 'Amount must be greater than zero.');
  }
  if (paise > 99999999999999) {
    throw new HttpError(400, 'Amount is too large.');
  }
  return paise;
}

export function paiseToRupees(paise) {
  return Number(paise || 0) / 100;
}

export function formatPkr(paise) {
  return `Rs. ${new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(paiseToRupees(paise))}`;
}

export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format.')
  .refine((value) => {
    const parsed = new Date(`${value}T12:00:00+05:00`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Invalid calendar date.');

export const idSchema = z.coerce.number().int().positive();

export function getPagination(query, defaultLimit = 25) {
  const page = Math.max(1, Number.parseInt(query.page || '1', 10) || 1);
  const rawLimit = Number.parseInt(query.limit || String(defaultLimit), 10) || defaultLimit;
  const limit = Math.min(200, Math.max(1, rawLimit));
  return { page, limit, offset: (page - 1) * limit };
}

export function safeJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, '\\$&');
}

export function transactionEffectSql(alias = 't') {
  return `CASE ${alias}.type
    WHEN 'purchase' THEN ${alias}.amount_paise
    WHEN 'payment' THEN -${alias}.amount_paise
    WHEN 'purchase_reversal' THEN -${alias}.amount_paise
    WHEN 'payment_reversal' THEN ${alias}.amount_paise
  END`;
}

export function signedEffect(type, amountPaise) {
  if (type === 'purchase' || type === 'payment_reversal') return amountPaise;
  return -amountPaise;
}

export function transactionSerial(txn) {
  if (!txn) return txn;
  return {
    ...txn,
    amount: paiseToRupees(txn.amount_paise),
    effect_paise: signedEffect(txn.type, txn.amount_paise),
    effect: paiseToRupees(signedEffect(txn.type, txn.amount_paise))
  };
}

export function supplierSerial(supplier) {
  if (!supplier) return supplier;
  return {
    ...supplier,
    balance: paiseToRupees(supplier.balance_paise || 0),
    purchases: paiseToRupees(supplier.purchases_paise || 0),
    payments: paiseToRupees(supplier.payments_paise || 0)
  };
}
