const API_BASE = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

function headersFor(body) {
  const headers = { 'X-Requested-With': 'XMLHttpRequest' };
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  return headers;
}

export async function api(path, options = {}) {
  const { method = 'GET', body, signal } = options;
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers: headersFor(body),
    body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    signal
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) {
      window.dispatchEvent(new CustomEvent('hisab:unauthorized'));
    }
    throw new ApiError(payload?.error || `Request failed (${response.status}).`, response.status, payload?.details);
  }

  return payload;
}

function filenameFromDisposition(disposition, fallback) {
  if (!disposition) return fallback;
  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch) return decodeURIComponent(utfMatch[1]);
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match ? match[1] : fallback;
}

export async function downloadFile(path, fallbackName = 'download') {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest' }
  });
  if (!response.ok) {
    let message = `Download failed (${response.status}).`;
    try {
      const payload = await response.json();
      message = payload.error || message;
    } catch {
      // Keep generic message.
    }
    if (response.status === 401) window.dispatchEvent(new CustomEvent('hisab:unauthorized'));
    throw new ApiError(message, response.status);
  }
  const blob = await response.blob();
  const filename = filenameFromDisposition(response.headers.get('content-disposition'), fallbackName);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  return filename;
}

export function queryString(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const newIdempotencyKey = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
