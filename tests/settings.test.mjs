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
      liveVideoId: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10',
      lotto: {
        mega7: {
          jackpot: '  $1,200,000 ',
          nextDraw: 'Sat 4 Oct, 8pm',
          results: [
            { date: '2026-09-13', numbers: [1, 2, 3, 4, 5, 6, 7] },
            { date: '2026-09-20', numbers: [9, 18, 27, 36, 45, 54, 63] },
          ],
        },
        easy6: { results: [{ date: '2026-09-20', numbers: [0, 10, 20, 30, 40, 99] }] },
      },
    },
  });
  assert.equal(res.status, 200);
  const saved = await res.json();
  assert.equal(saved.liveVideoId, 'dQw4w9WgXcQ');
  assert.equal(saved.lotto.mega7.jackpot, '$1,200,000');
  assert.equal(saved.lotto.mega7.nextDraw, 'Sat 4 Oct, 8pm');
  assert.equal(saved.lotto.mega7.results[0].date, '2026-09-20', 'results are sorted newest first');
  assert.equal(saved.lotto.easy6.jackpot, '$50,000', 'untouched fields keep their defaults');
  assert.deepEqual(saved.lotto.wild5, DEFAULT_SETTINGS.lotto.wild5);
  assert.equal(saved.ussdCode, DEFAULT_SETTINGS.ussdCode);

  // A later update to one game must not wipe the other games.
  await call(store, { method: 'PUT', password: PASSWORD, body: { lotto: { fast5: { nextDraw: 'Wed 1 Oct, 7pm' } } } });
  const again = await (await call(store)).json();
  assert.equal(again.lotto.mega7.jackpot, '$1,200,000');
  assert.equal(again.lotto.easy6.results.length, 1);
  assert.equal(again.lotto.fast5.nextDraw, 'Wed 1 Oct, 7pm');
});

test('PUT rejects invalid values with readable details', async () => {
  const res = await call(memoryStore(), {
    method: 'PUT', password: PASSWORD,
    body: {
      lotto: {
        mega7: { results: [{ date: '2026-02-30', numbers: [1, 2, 3, 4, 5, 6, 7] }, { date: '2026-06-01', numbers: [1, 2, 3, 4, 5] }] },
        wild5: { results: [{ date: '2026-06-02', numbers: [4, 4, 5, 6, 7] }], jackpot: '' },
        pick3: {},
      },
      ussdCode: '<script>',
      youtubeChannelUrl: 'https://evil.example/@x',
      licenceConfirmed: 'yes',
      jackpotAmount: '$1',
    },
  });
  assert.equal(res.status, 400);
  const { details } = await res.json();
  assert.equal(details.length, 9, details.join('\n'));
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

test('withDefaults ignores junk and old single-game settings in storage', () => {
  const s = withDefaults({ jackpotAmount: '$25,000', results: [], whatever: true, lotto: { mega7: { jackpot: 42, nextDraw: 'Sat 4 Oct' } } });
  assert.equal(s.lotto.mega7.jackpot, DEFAULT_SETTINGS.lotto.mega7.jackpot);
  assert.equal(s.lotto.mega7.nextDraw, 'Sat 4 Oct');
  for (const k of ['jackpotAmount', 'results', 'whatever']) assert.equal(k in s, false);
});

test('defaults carry the four Lotto games with their jackpots', () => {
  assert.deepEqual(Object.keys(DEFAULT_SETTINGS.lotto), ['mega7', 'wild5', 'fast5', 'easy6']);
  assert.deepEqual(Object.values(DEFAULT_SETTINGS.lotto).map((g) => g.jackpot), ['$1,000,000', '$250,000', '$100,000', '$50,000']);
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
