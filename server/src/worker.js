// Remembered team server. Serves the app from ../docs (the whole site sits behind Cloudflare Access email login)
// and calls OpenAI with the team key, with daily limits per agent.
// Secrets (never stored in this repo): OPENAI_API_KEY, ACCESS_TEAM_DOMAIN, ACCESS_AUD, OWNER_EMAIL.

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const fail = (status, error) => json({ error }, status);
const num = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : d; };
const base = env => env.OPENAI_BASE || 'https://api.openai.com';
// days run on Malaysia time, so limits reset at local midnight
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const KEEP = 60 * 60 * 24 * 40; // usage records expire after 40 days

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const email = await agentEmail(request, env);
    if (!email) return fail(401, 'Sign in with your approved email to use team AI.');
    try {
      if (url.pathname === '/api/me' && request.method === 'GET') return json(await me(env, email));
      if (url.pathname === '/api/words' && request.method === 'POST') return await words(request, env, email);
      if (url.pathname === '/api/image' && request.method === 'POST') return await image(request, env, email);
      if (url.pathname === '/api/scan' && request.method === 'POST') return await scan(request, env, email);
      if (url.pathname === '/api/usage' && request.method === 'GET') return await usage(env, email);
      return fail(404, 'Not found.');
    } catch {
      return fail(500, 'The team server had a problem. Try again in a minute.');
    }
  }
};

/* ---------- who is asking: Cloudflare Access token, checked again here ---------- */
// Access does the email login; verifying its signed token in the Worker means a misconfigured
// Access rule still can't let strangers spend the team key. Not configured = closed.
let certs = null, certsAt = 0;
const b64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));
async function agentEmail(request, env) {
  const host = new URL(request.url).hostname;
  if (env.DEV_EMAIL && (host === 'localhost' || host === '127.0.0.1')) return env.DEV_EMAIL.toLowerCase(); // local testing only
  const team = env.ACCESS_TEAM_DOMAIN, aud = env.ACCESS_AUD;
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!team || !aud || !token) return null;
  try {
    const [h, p, s] = token.split('.');
    const header = JSON.parse(new TextDecoder().decode(b64u(h))), payload = JSON.parse(new TextDecoder().decode(b64u(p)));
    const issuer = `https://${team}`;
    const audOk = Array.isArray(payload.aud) ? payload.aud.includes(aud) : payload.aud === aud;
    if (header.alg !== 'RS256' || payload.iss !== issuer || !audOk || !(payload.exp * 1000 > Date.now())) return null;
    if (!certs || Date.now() - certsAt > 3600e3) { certs = (await (await fetch(`${issuer}/cdn-cgi/access/certs`)).json()).keys; certsAt = Date.now(); }
    const jwk = certs.find(k => k.kid === header.kid);
    if (!jwk) { certs = null; return null; }
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(s), new TextEncoder().encode(`${h}.${p}`));
    return ok && payload.email ? String(payload.email).toLowerCase() : null;
  } catch {
    return null;
  }
}
const isOwner = (env, email) => !!env.OWNER_EMAIL && env.OWNER_EMAIL.trim().toLowerCase() === email;

/* ---------- daily limits ---------- */
function limits(env, email) {
  const owner = isOwner(env, email);
  return { posters: owner ? num(env.OWNER_DAILY_POSTERS, 20) : num(env.DAILY_POSTERS, 5), words: num(env.DAILY_WORDS, 30), scans: num(env.DAILY_SCANS, 20) };
}
const getUse = async (env, day, who) => (await env.USAGE.get(`d:${day}:${who}`, 'json')) || { posters: 0, words: 0, scans: 0 };
async function addUse(env, day, who, field) {
  for (const key of [who, '_team']) {
    const u = await getUse(env, day, key); u[field] = (u[field] || 0) + 1;
    await env.USAGE.put(`d:${day}:${key}`, JSON.stringify(u), { expirationTtl: KEEP });
  }
}
async function me(env, email) {
  const day = today();
  return { email, owner: isOwner(env, email), limits: limits(env, email), used: await getUse(env, day, email) };
}

/* ---------- OpenAI calls (only successful ones count) ---------- */
function openaiError(status, text) {
  let msg = ''; try { msg = JSON.parse(text).error.message || ''; } catch {}
  if (status === 401) return 'The team AI key is not working. Tell your team leader.';
  if (status === 429) return 'The team AI account is out of credit or busy. Tell your team leader.';
  if (status === 400 && /safety|moderation/i.test(msg)) return 'The AI refused this picture for safety reasons. Try a different photo or style.';
  return `AI service error ${status}. ${msg}`.trim();
}
const passOn = text => new Response(text, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function words(request, env, email) {
  const day = today(), lim = limits(env, email), u = await getUse(env, day, email);
  if (u.words >= lim.words) return fail(429, `Daily limit reached: ${lim.words} AI messages per agent per day. It resets at midnight.`);
  const body = await request.json().catch(() => null);
  const system = String((body && body.system) || ''), user = String((body && body.user) || '');
  if (!system || !user || system.length > 6000 || user.length > 6000) return fail(400, 'The message request is missing or too long.');
  const r = await fetch(`${base(env)}/v1/chat/completions`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: env.TEXT_MODEL || 'gpt-5-mini', response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }] })
  });
  const text = await r.text();
  if (!r.ok) return fail(502, openaiError(r.status, text));
  await addUse(env, day, email, 'words');
  return passOn(text);
}

const SIZES = ['1536x1024', '1024x1536'];
async function image(request, env, email) {
  const day = today(), lim = limits(env, email), u = await getUse(env, day, email);
  if (u.posters >= lim.posters) return fail(429, `Daily limit reached: ${lim.posters} AI pictures per agent per day. It resets at midnight. Quick design posters are still unlimited.`);
  if ((await getUse(env, day, '_team')).posters >= num(env.TEAM_DAILY_POSTERS, 60))
    return fail(429, 'The team has used today’s AI picture budget. It resets at midnight. Quick design posters are still unlimited.');
  const form = await request.formData().catch(() => null);
  const prompt = String((form && form.get('prompt')) || ''), photo = form && form.get('image'), size = String((form && form.get('size')) || '');
  if (!prompt || prompt.length > 4000 || !photo || typeof photo === 'string' || photo.size > 5e6 || !SIZES.includes(size))
    return fail(400, 'The picture request is missing something, or the photo is too large.');
  const fd = new FormData();
  fd.append('model', env.IMAGE_MODEL || 'gpt-image-2'); fd.append('prompt', prompt);
  fd.append('image', photo, 'me.jpg'); fd.append('size', size); fd.append('quality', env.IMAGE_QUALITY || 'medium');
  const r = await fetch(`${base(env)}/v1/images/edits`, { method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: fd });
  const text = await r.text();
  if (!r.ok) return fail(502, openaiError(r.status, text));
  await addUse(env, day, email, 'posters');
  return passOn(text);
}

/* ---------- read an ePartner customer/policy list from a photo or screenshot ---------- */
// The instructions live here, not in the app, so the team key can only be used for this job,
// and identity numbers, policy numbers and contact details are never sent back to the phone.
const SCAN_RULES = `You read one photo or screenshot of a Malaysian life-insurance agent portal (for example Great Eastern ePartner) showing a list of customers or policies.
Return JSON only: {"rows": [{"name": "", "dob": "", "commencement": "", "anniversary": "", "status": ""}], "note": ""}
- Great Eastern ePartner lists have the columns No. | Policy No. | Policy Holder | DOB | Life Assured | Commencement Date | Premium Due Date | Last payment date | Premium Amount | Payment Mode | Payment Method | Plan Type | Status | GJA Option | Issuing Agent Name. There, name = Policy Holder (not Life Assured), dob = DOB, commencement = Commencement Date, status = Status (for example "Inforce (Regular)" or "Terminated (Freelook Others)").
- One entry per policy row you can read. Copy names and dates exactly as printed: do not reformat, translate, complete or guess anything.
- dob = date of birth. commencement = policy commencement / inception / start / issue date. anniversary = policy anniversary date if a separate column shows it.
- Use "" for anything not shown or not readable. Skip rows that are cut off or blurred rather than guessing.
- Never output NRIC/IC or passport numbers, policy numbers, phone numbers, emails, addresses, premiums, sums assured, plan names or medical details, even if visible.
- note: one short sentence if the image is not a customer list, is unreadable, or some rows were skipped; otherwise "".`;
async function scan(request, env, email) {
  const day = today(), lim = limits(env, email), u = await getUse(env, day, email);
  if ((u.scans || 0) >= lim.scans) return fail(429, `Daily limit reached: ${lim.scans} list scans per agent per day. It resets at midnight.`);
  const body = await request.json().catch(() => null);
  const img = String((body && body.image) || '');
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(img) || img.length > 7e6) return fail(400, 'Send one JPG or PNG image under 5 MB.');
  const r = await fetch(`${base(env)}/v1/chat/completions`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: env.SCAN_MODEL || env.TEXT_MODEL || 'gpt-5-mini', response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SCAN_RULES }, { role: 'user', content: [{ type: 'text', text: 'Read this list.' }, { type: 'image_url', image_url: { url: img, detail: 'high' } }] }] })
  });
  const text = await r.text();
  if (!r.ok) return fail(502, openaiError(r.status, text));
  await addUse(env, day, email, 'scans');
  return passOn(text);
}

/* ---------- owner: who used how much (counts only, never customer details) ---------- */
async function usage(env, email) {
  if (!isOwner(env, email)) return fail(403, 'Only the team owner can see team usage.');
  const day = today(), month = day.slice(0, 7), rows = {};
  let cursor;
  do {
    const page = await env.USAGE.list({ prefix: `d:${month}`, cursor });
    for (const k of page.keys) {
      const [, d, who] = k.name.split(':');
      if (who === '_team') continue;
      const u = (await env.USAGE.get(k.name, 'json')) || {};
      const r = rows[who] || (rows[who] = { email: who, today: 0, month: 0, words: 0 });
      r.month += u.posters || 0; r.words += u.words || 0; if (d === day) r.today += u.posters || 0;
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return json({ day, limits: { agent: num(env.DAILY_POSTERS, 5), owner: num(env.OWNER_DAILY_POSTERS, 20), team: num(env.TEAM_DAILY_POSTERS, 60) },
    team: await getUse(env, day, '_team'), agents: Object.values(rows).sort((a, b) => b.month - a.month) });
}
