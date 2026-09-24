// Site settings: defaults, validation and the HTTP handler behind /api/settings.
// The handler takes its storage as an argument so it can be tested without Netlify.

import { createHash, timingSafeEqual } from 'node:crypto';

export const SETTINGS_KEY = 'settings';
export const MAX_RESULTS = 12;

export const DEFAULT_SETTINGS = Object.freeze({
  jackpotAmount: '$25,000',
  nextDrawDate: 'Sat 12 Jul, 8pm',
  liveVideoId: '',
  youtubeChannelUrl: 'https://www.youtube.com/@GoldStakeLotto',
  ussdCode: '*123#',
  whatsappNumber: '+263 77 000 0000',
  phoneNumber: '+263 78 148 0727',
  email: 'info@goldstakelotto.com',
  licenceConfirmed: false,
  results: [{ date: '2026-06-14', numbers: [31, 8, 56] }],
});

const TEXT_FIELDS = {
  jackpotAmount: 40,
  nextDrawDate: 60,
  whatsappNumber: 30,
  phoneNumber: 30,
};

const PHONE_RE = /^\+?[0-9 ()-]{6,30}$/;
const USSD_RE = /^[*#0-9]{2,20}$/;
const EMAIL_RE = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z]{2,24}$/i;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{6,20}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Pull a YouTube video id out of a bare id or any common YouTube URL. */
export function parseYouTubeId(input) {
  const raw = String(input ?? '').trim();
  if (raw === '') return '';
  if (VIDEO_ID_RE.test(raw)) return raw;
  let url;
  try { url = new URL(raw); } catch { return null; }
  const host = url.hostname.replace(/^www\.|^m\./, '');
  let id = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.searchParams.get('v');
    if (!id) {
      const m = url.pathname.match(/^\/(?:embed|live|shorts)\/([^/?#]+)/);
      if (m) id = m[1];
    }
  }
  return id && VIDEO_ID_RE.test(id) ? id : null;
}

function isValidDate(s) {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Validate a partial settings update. Unknown keys are rejected so typos
 * don't silently vanish. Returns { value, errors }.
 */
export function validateSettingsPatch(input) {
  const errors = [];
  const value = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { value, errors: ['Body must be a JSON object.'] };
  }

  for (const [key, v] of Object.entries(input)) {
    if (key in TEXT_FIELDS) {
      if (typeof v !== 'string' || v.trim() === '') { errors.push(`${key} must be a non-empty string.`); continue; }
      const t = v.trim();
      if (t.length > TEXT_FIELDS[key]) { errors.push(`${key} must be at most ${TEXT_FIELDS[key]} characters.`); continue; }
      if ((key === 'whatsappNumber' || key === 'phoneNumber') && !PHONE_RE.test(t)) { errors.push(`${key} doesn't look like a phone number.`); continue; }
      value[key] = t;
    } else if (key === 'ussdCode') {
      const t = typeof v === 'string' ? v.trim() : '';
      if (!USSD_RE.test(t)) { errors.push('ussdCode may only contain digits, * and #.'); continue; }
      value[key] = t;
    } else if (key === 'email') {
      const t = typeof v === 'string' ? v.trim() : '';
      if (!EMAIL_RE.test(t)) { errors.push('email is not a valid address.'); continue; }
      value[key] = t;
    } else if (key === 'youtubeChannelUrl') {
      let url;
      try { url = new URL(String(v).trim()); } catch { errors.push('youtubeChannelUrl must be a URL.'); continue; }
      if (url.protocol !== 'https:' || !/^(www\.)?youtube\.com$/.test(url.hostname)) {
        errors.push('youtubeChannelUrl must be an https://www.youtube.com/ link.'); continue;
      }
      value[key] = url.origin + url.pathname.replace(/\/+$/, '');
    } else if (key === 'liveVideoId') {
      const id = parseYouTubeId(v);
      if (id === null) { errors.push('liveVideoId must be a YouTube video id or link, or empty.'); continue; }
      value[key] = id;
    } else if (key === 'licenceConfirmed') {
      if (typeof v !== 'boolean') { errors.push('licenceConfirmed must be true or false.'); continue; }
      value[key] = v;
    } else if (key === 'results') {
      if (!Array.isArray(v)) { errors.push('results must be a list.'); continue; }
      if (v.length > MAX_RESULTS) { errors.push(`results can hold at most ${MAX_RESULTS} draws.`); continue; }
      const out = [];
      v.forEach((r, i) => {
        const where = `results[${i}]`;
        if (!r || typeof r !== 'object') { errors.push(`${where} must be an object.`); return; }
        if (typeof r.date !== 'string' || !isValidDate(r.date)) { errors.push(`${where}.date must be a date (YYYY-MM-DD).`); return; }
        const nums = r.numbers;
        if (!Array.isArray(nums) || nums.length !== 3 || !nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 99)) {
          errors.push(`${where}.numbers must be three whole numbers from 0 to 99.`); return;
        }
        if (new Set(nums).size !== 3) { errors.push(`${where}.numbers must all be different.`); return; }
        out.push({ date: r.date, numbers: [...nums] });
      });
      // Newest first, so the site can always treat results[0] as the latest draw.
      out.sort((a, b) => b.date.localeCompare(a.date));
      value[key] = out;
    } else {
      errors.push(`Unknown setting: ${key}.`);
    }
  }
  return { value, errors };
}

/** Merge stored settings over the defaults, dropping anything stale or unknown. */
export function withDefaults(stored) {
  const { value } = validateSettingsPatch(stored && typeof stored === 'object' ? pickKnown(stored) : {});
  return { ...structuredClone(DEFAULT_SETTINGS), ...value };
}

function pickKnown(obj) {
  const out = {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) if (k in obj) out[k] = obj[k];
  return out;
}

function digest(s) {
  return createHash('sha256').update(String(s)).digest();
}

/** Constant-time check of a "Bearer <password>" header against the configured password. */
export function isAuthorized(req, adminPassword) {
  if (!adminPassword) return false;
  const header = req.headers.get('authorization') || '';
  const m = header.match(/^Bearer (.+)$/);
  if (!m) return false;
  return timingSafeEqual(digest(m[1]), digest(adminPassword));
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

const NO_STORE = { 'cache-control': 'no-store' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * store: { get(key) -> object|null, set(key, object) }
 * options.failDelayMs: pause after a wrong password to slow down guessing.
 */
export async function handleSettingsRequest(req, { store, adminPassword, failDelayMs = 800 }) {
  const path = new URL(req.url).pathname.replace(/\/+$/, '');

  const requireAdmin = async () => {
    if (!adminPassword || adminPassword.length < 12) {
      return json({ error: 'Admin is not set up. Set an ADMIN_PASSWORD (12+ characters) in the site environment variables.' }, 503, NO_STORE);
    }
    if (!isAuthorized(req, adminPassword)) {
      if (failDelayMs) await sleep(failDelayMs);
      return json({ error: 'Wrong password.' }, 401, NO_STORE);
    }
    return null;
  };

  if (path === '/api/admin/verify') {
    if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'POST' });
    const denied = await requireAdmin();
    return denied ?? json({ ok: true }, 200, NO_STORE);
  }

  if (path !== '/api/settings') return json({ error: 'Not found.' }, 404);

  if (req.method === 'GET' || req.method === 'HEAD') {
    const settings = withDefaults(await store.get(SETTINGS_KEY));
    return json(settings, 200, { 'cache-control': 'public, max-age=30, stale-while-revalidate=300' });
  }

  if (req.method === 'PUT') {
    const denied = await requireAdmin();
    if (denied) return denied;
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Body must be valid JSON.' }, 400, NO_STORE); }
    const { value, errors } = validateSettingsPatch(body);
    if (errors.length) return json({ error: 'Some settings are invalid.', details: errors }, 400, NO_STORE);
    const next = { ...withDefaults(await store.get(SETTINGS_KEY)), ...value, updatedAt: new Date().toISOString() };
    await store.set(SETTINGS_KEY, next);
    return json(withDefaults(next), 200, NO_STORE);
  }

  return json({ error: 'Method not allowed.' }, 405, { allow: 'GET, HEAD, PUT' });
}
