export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

export function formatCurrency(paise, options = {}) {
  const value = Number(paise || 0) / 100;
  const formatted = new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: options.decimals === false ? 0 : 2
  }).format(value);
  return `Rs. ${formatted}`;
}

export function formatNumber(paise) {
  return new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(Number(paise || 0) / 100);
}

export function parseClientAmount(value) {
  const text = String(value || '').trim().replace(/,/g, '');
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(text)) return null;
  const amount = Number(text);
  return amount > 0 ? Math.round(amount * 100) : null;
}

export function formatDate(dateString, lang = 'en') {
  if (!dateString) return '—';
  const date = dateString.length === 10 ? new Date(`${dateString}T12:00:00+05:00`) : new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat(lang === 'ur' ? 'ur-PK' : 'en-PK', {
    timeZone: 'Asia/Karachi',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

export function formatDateTime(value, lang = 'en') {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(lang === 'ur' ? 'ur-PK' : 'en-PK', {
    timeZone: 'Asia/Karachi',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

export function formatTime(value, lang = 'en') {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(lang === 'ur' ? 'ur-PK' : 'en-PK', {
    timeZone: 'Asia/Karachi',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

export function formatMonth(monthKey, lang = 'en') {
  if (!monthKey) return '—';
  const date = new Date(`${monthKey}-01T12:00:00+05:00`);
  if (Number.isNaN(date.getTime())) return monthKey;
  return new Intl.DateTimeFormat(lang === 'ur' ? 'ur-PK' : 'en-PK', {
    timeZone: 'Asia/Karachi',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

export function formatPeriod(period, groupBy = 'day', lang = 'en') {
  if (!period) return '—';
  if (groupBy === 'month') return formatMonth(period, lang);
  if (groupBy === 'year') return period;
  return formatDate(period, lang);
}

export function todayPk() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

export function monthStartPk() {
  return `${todayPk().slice(0, 7)}-01`;
}

export function daysAgoPk(days) {
  const [year, month, day] = todayPk().split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day - days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function daysSince(dateValue) {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
}

export function txnTypeLabelKey(type) {
  return `txn.type.${type}`;
}
