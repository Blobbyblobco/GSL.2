// Agent and contact form submissions: validation, storage, optional email alert,
// and the admin listing.

import { checkAdmin, json, NO_STORE, STORAGE_MISSING } from './settings.mjs';

export const SUBMISSIONS_KEY = 'submissions';
export const MAX_SUBMISSIONS = 500;

// Field name -> max length; every field is required.
export const FORMS = {
  agent: { label: 'Agent enquiry', fields: { name: 100, phone: 30, shop: 150 } },
  contact: { label: 'Contact message', fields: { name: 100, contact: 150, message: 3000 } },
};

function wantsJson(req) {
  return (req.headers.get('accept') || '').includes('application/json');
}

// JS submissions get JSON; plain HTML form posts get sent to the thank-you page.
function done(req) {
  if (wantsJson(req)) return json({ ok: true }, 200, NO_STORE);
  return new Response(null, { status: 303, headers: { location: '/thanks.html' } });
}

function fail(req, status, message) {
  if (wantsJson(req)) return json({ error: message }, status, NO_STORE);
  return new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

/** Parse and validate a submission. Returns { form, fields } or { error }. */
export function parseSubmission(data) {
  const formName = String(data.get('form-name') || '');
  const spec = FORMS[formName];
  if (!spec) return { error: 'Unknown form.' };
  const fields = {};
  for (const [name, max] of Object.entries(spec.fields)) {
    const v = String(data.get(name) ?? '').trim();
    if (!v) return { error: `Please fill in ${name}.` };
    if (v.length > max) return { error: `${name} is too long.` };
    fields[name] = v;
  }
  return { form: formName, fields };
}

async function sendAlert(entry, env, fetchImpl) {
  const key = env.RESEND_API_KEY;
  const to = env.NOTIFY_EMAIL;
  if (!key || !to) return;
  const spec = FORMS[entry.form];
  const text = Object.entries(entry.fields).map(([k, v]) => `${k}: ${v}`).join('\n');
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.NOTIFY_FROM || 'GSL Website <onboarding@resend.dev>',
      to: to.split(',').map((s) => s.trim()).filter(Boolean),
      subject: `New ${spec.label.toLowerCase()} — ${entry.fields.name}`,
      text: `${text}\n\nReceived ${entry.at}`,
    }),
  });
  if (!res.ok) throw new Error(`Email alert failed: ${res.status}`);
}

/** POST /api/forms */
export async function handleFormRequest(req, { store, env = {}, fetchImpl = fetch }) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'POST' });
  let data;
  try { data = await req.formData(); } catch { return fail(req, 400, 'Could not read the form.'); }

  // Honeypot: bots fill the hidden field. Pretend it worked and drop it.
  if (String(data.get('bot-field') || '')) return done(req);

  const parsed = parseSubmission(data);
  if (parsed.error) return fail(req, 400, parsed.error);
  if (!store) return fail(req, 503, 'Sorry, messages can’t be received right now. Please call or WhatsApp us.');

  const entry = { form: parsed.form, fields: parsed.fields, at: new Date().toISOString() };
  await store.push(SUBMISSIONS_KEY, entry, MAX_SUBMISSIONS);
  // The submission is already saved, so a failed email must not fail the request.
  try { await sendAlert(entry, env, fetchImpl); } catch (err) { console.error(err); }
  return done(req);
}

/** GET /api/admin/submissions */
export async function handleSubmissionsRequest(req, { store, adminPassword, failDelayMs = 800 }) {
  if (req.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, { allow: 'GET' });
  const denied = await checkAdmin(req, adminPassword, failDelayMs);
  if (denied) return denied;
  if (!store) return json({ error: STORAGE_MISSING }, 503, NO_STORE);
  const items = await store.list(SUBMISSIONS_KEY, 100);
  return json({ items }, 200, NO_STORE);
}
