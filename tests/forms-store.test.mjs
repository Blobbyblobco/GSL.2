import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redisFromEnv } from '../lib/store.mjs';
import { handleFormRequest, handleSubmissionsRequest, MAX_SUBMISSIONS } from '../lib/forms.mjs';
import { handleSettingsRequest } from '../lib/settings.mjs';

const PASSWORD = 'correct horse battery';
const ENV = { UPSTASH_REDIS_REST_URL: 'https://redis.test', UPSTASH_REDIS_REST_TOKEN: 'tok' };

// Minimal fake of Upstash's REST API: POST a JSON command array, get { result }.
function fakeUpstash() {
  const db = new Map();
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (init.headers.authorization !== 'Bearer tok') return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
    const [cmd, key, ...args] = JSON.parse(init.body);
    let result = null;
    if (cmd === 'GET') result = db.get(key) ?? null;
    else if (cmd === 'SET') { db.set(key, args[0]); result = 'OK'; }
    else if (cmd === 'LPUSH') { const l = db.get(key) || []; l.unshift(args[0]); db.set(key, l); result = l.length; }
    else if (cmd === 'LTRIM') { db.set(key, (db.get(key) || []).slice(args[0], args[1] + 1)); result = 'OK'; }
    else if (cmd === 'LRANGE') result = (db.get(key) || []).slice(args[0], args[1] + 1);
    else return new Response(JSON.stringify({ error: 'unknown command' }), { status: 400 });
    return new Response(JSON.stringify({ result }));
  };
  return { db, calls, fetchImpl };
}

function formPost(fields, { json = true } = {}) {
  const headers = { 'content-type': 'application/x-www-form-urlencoded' };
  if (json) headers.accept = 'application/json';
  return new Request('https://example.test/api/forms', { method: 'POST', headers, body: new URLSearchParams(fields).toString() });
}

test('redisFromEnv is null until Redis is connected, and accepts either env var naming', () => {
  assert.equal(redisFromEnv({}), null);
  assert.ok(redisFromEnv(ENV));
  assert.ok(redisFromEnv({ KV_REST_API_URL: 'https://redis.test', KV_REST_API_TOKEN: 'tok' }));
});

test('store round-trips JSON under a gsl: prefix', async () => {
  const up = fakeUpstash();
  const store = redisFromEnv(ENV, up.fetchImpl);
  assert.equal(await store.get('settings'), null);
  await store.set('settings', { a: 1 });
  assert.deepEqual(await store.get('settings'), { a: 1 });
  assert.ok(up.db.has('gsl:settings'));
  for (let i = 0; i < 5; i++) await store.push('list', { i }, 3);
  assert.deepEqual(await store.list('list', 10), [{ i: 4 }, { i: 3 }, { i: 2 }]);
});

test('store surfaces Redis errors', async () => {
  const store = redisFromEnv({ ...ENV, UPSTASH_REDIS_REST_TOKEN: 'wrong' }, fakeUpstash().fetchImpl);
  await assert.rejects(store.get('x'), /Redis GET failed/);
});

test('settings save and load through the Redis store', async () => {
  const store = redisFromEnv(ENV, fakeUpstash().fetchImpl);
  const put = new Request('https://example.test/api/settings', {
    method: 'PUT', headers: { authorization: `Bearer ${PASSWORD}` }, body: JSON.stringify({ lotto: { mega7: { jackpot: '$1,100,000' } } }),
  });
  assert.equal((await handleSettingsRequest(put, { store, adminPassword: PASSWORD, failDelayMs: 0 })).status, 200);
  const res = await handleSettingsRequest(new Request('https://example.test/api/settings'), { store, adminPassword: PASSWORD });
  assert.equal((await res.json()).lotto.mega7.jackpot, '$1,100,000');
});

test('without storage the site gets defaults and saving is refused', async () => {
  const get = await handleSettingsRequest(new Request('https://example.test/api/settings'), { store: null, adminPassword: PASSWORD });
  assert.equal(get.status, 200);
  const put = new Request('https://example.test/api/settings', { method: 'PUT', headers: { authorization: `Bearer ${PASSWORD}` }, body: '{}' });
  const res = await handleSettingsRequest(put, { store: null, adminPassword: PASSWORD, failDelayMs: 0 });
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /Upstash Redis/);
});

test('valid agent and contact submissions are stored', async () => {
  const store = redisFromEnv(ENV, fakeUpstash().fetchImpl);
  let res = await handleFormRequest(formPost({ 'form-name': 'agent', 'bot-field': '', name: ' Farai ', phone: '0771234567', shop: 'Mutema Stores, Mutare' }), { store });
  assert.equal(res.status, 200);
  res = await handleFormRequest(formPost({ 'form-name': 'contact', name: 'Tariro', contact: '0770000000', message: 'When is the next draw?' }), { store });
  assert.equal(res.status, 200);
  const items = await store.list('submissions', 10);
  assert.equal(items.length, 2);
  assert.equal(items[0].form, 'contact');
  assert.deepEqual(items[1].fields, { name: 'Farai', phone: '0771234567', shop: 'Mutema Stores, Mutare' });
});

test('plain HTML form posts are redirected to the thank-you page', async () => {
  const store = redisFromEnv(ENV, fakeUpstash().fetchImpl);
  const res = await handleFormRequest(formPost({ 'form-name': 'agent', name: 'A', phone: '1', shop: 'S' }, { json: false }), { store });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/thanks.html');
});

test('bad submissions are rejected and bots are silently dropped', async () => {
  const store = redisFromEnv(ENV, fakeUpstash().fetchImpl);
  const cases = [
    { 'form-name': 'agent', name: 'A', phone: '', shop: 'S' },
    { 'form-name': 'nope', name: 'A' },
    { 'form-name': 'contact', name: 'A', contact: 'c', message: 'x'.repeat(3001) },
  ];
  for (const fields of cases) assert.equal((await handleFormRequest(formPost(fields), { store })).status, 400);
  const bot = await handleFormRequest(formPost({ 'form-name': 'agent', 'bot-field': 'spam', name: 'A', phone: '1', shop: 'S' }), { store });
  assert.equal(bot.status, 200);
  assert.deepEqual(await store.list('submissions', 10), []);
  assert.equal((await handleFormRequest(new Request('https://example.test/api/forms'), { store })).status, 405);
});

test('forms return 503 without storage', async () => {
  const res = await handleFormRequest(formPost({ 'form-name': 'agent', name: 'A', phone: '1', shop: 'S' }), { store: null });
  assert.equal(res.status, 503);
});

test('email alert is sent when configured, and its failure does not lose the submission', async () => {
  const up = fakeUpstash();
  const store = redisFromEnv(ENV, up.fetchImpl);
  const sent = [];
  const mailFetch = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return new Response('{}', { status: 500 }); };
  const env = { RESEND_API_KEY: 'k', NOTIFY_EMAIL: 'a@x.co, b@x.co' };
  const res = await handleFormRequest(formPost({ 'form-name': 'agent', name: 'Farai', phone: '1', shop: 'S' }), { store, env, fetchImpl: mailFetch });
  assert.equal(res.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'https://api.resend.com/emails');
  assert.deepEqual(sent[0].body.to, ['a@x.co', 'b@x.co']);
  assert.match(sent[0].body.subject, /agent enquiry — Farai/);
  assert.equal((await store.list('submissions', 10)).length, 1);
});

test('submissions list requires the admin password', async () => {
  const store = redisFromEnv(ENV, fakeUpstash().fetchImpl);
  await store.push('submissions', { form: 'agent', fields: { name: 'A' }, at: 'now' }, MAX_SUBMISSIONS);
  const req = (pw) => new Request('https://example.test/api/admin/submissions', { headers: pw ? { authorization: `Bearer ${pw}` } : {} });
  assert.equal((await handleSubmissionsRequest(req(), { store, adminPassword: PASSWORD, failDelayMs: 0 })).status, 401);
  const ok = await handleSubmissionsRequest(req(PASSWORD), { store, adminPassword: PASSWORD, failDelayMs: 0 });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).items.length, 1);
});
