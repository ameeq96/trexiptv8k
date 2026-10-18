const LOCAL_ORIGIN = 'http://127.0.0.1:8001';
const MAIN_ORIGIN = 'https://opplexiptv.com';

export function apiOrigin() {
  return typeof window !== 'undefined'
    && ['http:', 'https:'].includes(window.location.protocol)
    && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
    ? LOCAL_ORIGIN : MAIN_ORIGIN;
}

export function centralUrl(path, source = '', origin = apiOrigin()) {
  if (![LOCAL_ORIGIN, MAIN_ORIGIN].includes(origin)) return null;
  let url;
  try { url = new URL(path, origin); } catch { return null; }
  if (url.origin !== origin || url.username || url.password) return null;
  if (source) {
    url.searchParams.set('utm_source', source);
    url.searchParams.set('utm_medium', 'landing');
  }
  return url.href;
}

export function checkoutUrl(id, source) {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return centralUrl('/checkout?package_id=' + id, source);
}

export function money(amount, currency, locale = 'en') {
  return new Intl.NumberFormat(locale, {
    style: 'currency', currency, currencyDisplay: 'code',
  }).format(amount);
}

export function durationText(months, locale = 'en') {
  return new Intl.NumberFormat(locale, {
    style: 'unit', unit: 'month', unitDisplay: 'long',
  }).format(months);
}

export function message(ui, key, values = {}) {
  const text = typeof ui?.[key] === 'string' ? ui[key] : key;
  return text.replace(/\{([a-z]+)\}/g, (match, name) =>
    Object.hasOwn(values, name) ? String(values[name]) : match);
}

export function availablePlans(rows, locale = 'en') {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  return rows.filter(plan => {
    if (!plan || plan.type !== 'iptv' || plan.is_available !== true
      || !Number.isSafeInteger(plan.id) || plan.id <= 0 || seen.has(plan.id)
      || !Number.isFinite(Number(plan.price_amount)) || Number(plan.price_amount) <= 0
      || !Number.isSafeInteger(plan.duration_months) || plan.duration_months <= 0
      || typeof plan.currency !== 'string' || !/^[A-Z]{3}$/.test(plan.currency)) return false;
    seen.add(plan.id);
    return true;
  }).map(plan => ({
    ...plan, price: money(Number(plan.price_amount), plan.currency, locale),
  })).sort((a, b) => a.duration_months - b.duration_months);
}

function timedRequest(signal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 12000);
  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    },
  };
}

function responseError(status, key, fields) {
  const error = new Error(key);
  error.status = status;
  error.code = key;
  if (fields && typeof fields === 'object' && !Array.isArray(fields)) error.fields = fields;
  return error;
}

export async function getApiData(path, signal) {
  const request = timedRequest(signal);
  try {
    const url = centralUrl('/api/v1/site/' + path);
    if (!url) throw new Error('Invalid API destination');
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      cache: 'no-store',
      signal: request.signal,
    });
    if (!response.ok) throw responseError(response.status, 'catalogUnavailable');
    const body = await response.json();
    if (!body?.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
      throw responseError(response.status, 'catalogUnavailable');
    }
    return body.data;
  } finally {
    request.clear();
  }
}

export async function postLanding(path, data, options = {}) {
  const request = timedRequest(options.signal);
  try {
    if (!['events', 'leads'].includes(path)) throw new Error('Invalid landing destination');
    const response = await fetch(centralUrl('/api/v1/landing/' + path), {
      method: 'POST',
      credentials: 'omit',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: request.signal,
      keepalive: options.keepalive === true,
    });
    if (!response.ok) {
      const body = response.status === 422 ? await response.json().catch(() => ({})) : {};
      throw responseError(response.status,
        response.status === 429 ? 'tooMany' : response.status === 409 ? 'conflict' : 'saveFailed',
        body.errors);
    }
    const body = await response.json();
    if (body?.ok !== true) throw responseError(response.status, 'unconfirmed');
    return body;
  } finally {
    request.clear();
  }
}

export function savedPlanUrl(value, origin = apiOrigin()) {
  if (![LOCAL_ORIGIN, MAIN_ORIGIN].includes(origin)) return null;
  try {
    const url = new URL(value);
    return url.origin === origin && !url.username && !url.password && !url.search && !url.hash
      && /^\/checkout\/resume\/[A-Za-z0-9_-]+$/.test(url.pathname) ? url.href : null;
  } catch { return null; }
}

export async function postResumeLink(data, options = {}) {
  const request = timedRequest(options.signal);
  try {
    const response = await fetch(centralUrl('/api/v1/landing/resume-links'), {
      method: 'POST',
      credentials: 'omit',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: request.signal,
    });
    if (!response.ok) throw responseError(response.status, 'resumeFailed');
    const body = await response.json();
    if (body?.ok !== true || typeof body.data?.url !== 'string' || typeof body.data?.expires_at !== 'string') {
      throw responseError(response.status, 'resumeFailed');
    }
    return body;
  } finally {
    request.clear();
  }
}

export function newRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16)
    + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}
