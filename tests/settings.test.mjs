import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS, handleSettingsRequest, parseYouTubeId, validateSettingsPatch, withDefaults,
} from '../lib/settings.mjs';

const PASSWORD = 'correct horse battery';

function memoryStore(initial = {}) {
  const data = { ...initial };
  return { data, get: async (k) => data[k] ?? null, set: async (k, v) => { data[k] = structuredClone(v); } };
}

function call(store, { method = 'GET', path = '/api/settings', body, password } = {}) {
  const headers = {};
  if (password) headers.authorization = `Bearer ${password}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const req = new Request(`https://example.test${path}`, {
    method, headers, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  return handleSettingsRequest(req, { store, adminPassword: PASSWORD, failDelayMs: 0 });
}

test('GET returns defaults when nothing is stored', async () => {
  const res = await call(memoryStore());
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), DEFAULT_SETTINGS);
  assert.match(res.headers.get('cache-control'), /max-age=30/);
});

test('PUT without the right password is rejected and nothing is stored', async () => {
  const store = memoryStore();
  for (const password of [undefined, 'wrong password!!']) {
    const res = await call(store, { method: 'PUT', body: { jackpotAmount: '$1' }, password });
    assert.equal(res.status, 401);
  }
  assert.deepEqual(store.data, {});
});

test('PUT is refused when no admin password is configured', async () => {
  const req = new Request('https://example.test/api/settings', {
    method: 'PUT', headers: { authorization: 'Bearer anything' }, body: '{}',
  });
  const res = await handleSettingsRequest(req, { store: memoryStore(), adminPassword: undefined, failDelayMs: 0 });
  assert.equal(res.status, 503);
});

test('PUT saves a valid partial update and GET returns it merged with defaults', async () => {
  const store = memoryStore();
  const res = await call(store, {
    method: 'PUT', password: PASSWORD,
    body: {
      jackpotAmount: '  $30,000 ',
      liveVideoId: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10',
      results: [{ date: '2026-06-14', numbers: [31, 8, 56] }, { date: '2026-06-28', numbers: [0, 99, 5] }],
    },
  });
  assert.equal(res.status, 200);
  const saved = await res.json();
  assert.equal(saved.jackpotAmount, '$30,000');
  assert.equal(saved.liveVideoId, 'dQw4w9WgXcQ');
  assert.equal(saved.results[0].date, '2026-06-28', 'results are sorted newest first');
  assert.equal(saved.ussdCode, DEFAULT_SETTINGS.ussdCode);

  const again = await (await call(store)).json();
  assert.deepEqual(again, saved);
});

test('PUT rejects invalid values with readable details', async () => {
  const res = await call(memoryStore(), {
    method: 'PUT', password: PASSWORD,
    body: {
      results: [{ date: '2026-02-30', numbers: [1, 2, 3] }, { date: '2026-06-01', numbers: [4, 4, 5] }, { date: '2026-06-02', numbers: [1, 2, 100] }],
      ussdCode: '<script>',
      youtubeChannelUrl: 'https://evil.example/@x',
      licenceConfirmed: 'yes',
      surprise: 1,
    },
  });
  assert.equal(res.status, 400);
  const { details } = await res.json();
  assert.equal(details.length, 7);
});

test('PUT rejects malformed JSON', async () => {
  const res = await call(memoryStore(), { method: 'PUT', password: PASSWORD, body: '{nope' });
  assert.equal(res.status, 400);
});

test('verify endpoint checks the password', async () => {
  assert.equal((await call(memoryStore(), { method: 'POST', path: '/api/admin/verify', password: PASSWORD })).status, 200);
  assert.equal((await call(memoryStore(), { method: 'POST', path: '/api/admin/verify', password: 'nope nope nope' })).status, 401);
});

test('unsupported methods get 405', async () => {
  assert.equal((await call(memoryStore(), { method: 'DELETE' })).status, 405);
});

test('withDefaults ignores junk that ended up in storage', () => {
  const s = withDefaults({ jackpotAmount: 42, whatever: true, nextDrawDate: 'Sat 26 Jul, 8pm' });
  assert.equal(s.jackpotAmount, DEFAULT_SETTINGS.jackpotAmount);
  assert.equal(s.nextDrawDate, 'Sat 26 Jul, 8pm');
  assert.equal('whatever' in s, false);
});

test('parseYouTubeId handles ids, links and junk', () => {
  assert.equal(parseYouTubeId(''), '');
  assert.equal(parseYouTubeId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseYouTubeId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseYouTubeId('https://www.youtube.com/live/dQw4w9WgXcQ?si=abc'), 'dQw4w9WgXcQ');
  assert.equal(parseYouTubeId('https://example.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(parseYouTubeId('"><img src=x>'), null);
});

test('validateSettingsPatch rejects non-objects', () => {
  assert.equal(validateSettingsPatch([]).errors.length, 1);
  assert.equal(validateSettingsPatch(null).errors.length, 1);
});
