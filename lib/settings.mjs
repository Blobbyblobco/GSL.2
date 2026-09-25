// Site settings: defaults, validation and the HTTP handler behind /api/settings.
// The handler takes its storage as an argument so it can be tested without Netlify.

import { createHash, timingSafeEqual } from 'node:crypto';

export const SETTINGS_KEY = 'settings';
export const MAX_RESULTS = 12;

// Weekly Lotto games: each draw is `picks` different numbers from 1 to `max`.
export const LOTTO_GAMES = Object.freeze({
  mega7: { name: 'Mega 7', picks: 7, max: 37, jackpot: '$1,000,000' },
  wild5: { name: 'Wild 5', picks: 5, max: 49, jackpot: '$250,000' },
  fast5: { name: 'Fast 5', picks: 5, max: 42, jackpot: '$100,000' },
  easy6: { name: 'Easy 6', picks: 6, max: 39, jackpot: '$50,000' },
});

export const DEFAULT_SETTINGS = Object.freeze({
  // nextDraw is free text (e.g. "Sun 5 Oct, 8pm"); empty means the site shows the game's regular draw day.
  lotto: Object.fromEntries(Object.entries(LOTTO_GAMES).map(([id, g]) => [id, { jackpot: g.jackpot, nextDraw: '', results: [] }])),
  liveVideoId: '',
  youtubeChannelUrl: 'https://www.youtube.com/@GoldStakeLotto',
  ussdCode: '*123#',
  whatsappNumber: '+263 77 000 0000',
  phoneNumber: '+263 78 148 0727',
  email: 'info@goldstakelotto.com',
  licenceConfirmed: false,
});

const TEXT_FIELDS = {
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

/** Validate one Lotto game's partial settings; pushes problems onto errors and returns the clean value. */
function validateLottoGame(id, g, errors) {
  const { name, picks, max } = LOTTO_GAMES[id];
  if (!g || typeof g !== 'object' || Array.isArray(g)) { errors.push(`${name} settings must be an object.`); return null; }
  const out = {};
  for (const [field, v] of Object.entries(g)) {
    if (field === 'jackpot') {
      const t = typeof v === 'string' ? v.trim() : '';
      if (!t || t.length > 40) { errors.push(`${name} jackpot must be 1–40 characters.`); continue; }
      out.jackpot = t;
    } else if (field === 'nextDraw') {
      if (typeof v !== 'string' || v.trim().length > 60) { errors.push(`${name} next draw must be at most 60 characters.`); continue; }
      out.nextDraw = v.trim();
    } else if (field === 'results') {
      if (!Array.isArray(v)) { errors.push(`${name} results must be a list.`); continue; }
      if (v.length > MAX_RESULTS) { errors.push(`${name} can keep at most ${MAX_RESULTS} results.`); continue; }
      const results = [];
      v.forEach((r, i) => {
        const where = `${name} result ${i + 1}`;
        if (!r || typeof r !== 'object') { errors.push(`${where} must be an object.`); return; }
        if (typeof r.date !== 'string' || !isValidDate(r.date)) { errors.push(`${where}: date must be YYYY-MM-DD.`); return; }
        const nums = r.numbers;
        if (!Array.isArray(nums) || nums.length !== picks || !nums.every((n) => Number.isInteger(n) && n >= 1 && n <= max)) {
          errors.push(`${where}: needs ${picks} whole numbers from 1 to ${max}.`); return;
        }
        if (new Set(nums).size !== picks) { errors.push(`${where}: numbers must all be different.`); return; }
        results.push({ date: r.date, numbers: [...nums] });
      });
      // Newest first, so the site can always treat results[0] as the latest draw.
      results.sort((a, b) => b.date.localeCompare(a.date));
      out.results = results;
    } else {
      errors.push(`Unknown ${name} setting: ${field}.`);
    }
  }
  return out;
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
    } else if (key === 'lotto') {
      if (!v || typeof v !== 'object' || Array.isArray(v)) { errors.push('lotto must be an object keyed by game.'); continue; }
      const out = {};
      for (const [id, g] of Object.entries(v)) {
        if (!(id in LOTTO_GAMES)) { errors.push(`Unknown Lotto game: ${id}.`); continue; }
        const game = validateLottoGame(id, g, errors);
        if (game) out[id] = game;
      }
      value[key] = out;
    } else {
      errors.push(`Unknown setting: ${key}.`);
    }
  }
  return { value, errors };
}

/** Merge settings over the defaults (per Lotto game too), dropping anything stale or unknown. */
export function withDefaults(stored) {
  const { value } = validateSettingsPatch(stored && typeof stored === 'object' ? pickKnown(stored) : {});
  return mergeSettings(structuredClone(DEFAULT_SETTINGS), value);
}

function mergeSettings(base, patch) {
  const { lotto, ...rest } = patch;
  const out = { ...base, ...rest };
  if (lotto) {
    out.lotto = { ...base.lotto };
    for (const [id, g] of Object.entries(lotto)) out.lotto[id] = { ...base.lotto[id], ...g };
  }
  return out;
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
    const next = { ...mergeSettings(withDefaults(await store.get(SETTINGS_KEY)), value), updatedAt: new Date().toISOString() };
    await store.set(SETTINGS_KEY, next);
    return json(withDefaults(next), 200, NO_STORE);
  }

  return json({ error: 'Method not allowed.' }, 405, { allow: 'GET, HEAD, PUT' });
}
