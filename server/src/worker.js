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
  async scheduled(event, env, ctx) { ctx.waitUntil(hourlyReminders(env)); },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      // phones must check for a new version of the page every time, so updates show on the next open
      const res = await env.ASSETS.fetch(request);
      if (!/text\/html|manifest|javascript/.test(res.headers.get('Content-Type') || '')) return res;
      const fresh = new Response(res.body, res);
      fresh.headers.set('Cache-Control', 'no-cache');
      return fresh;
    }
    const email = await agentEmail(request, env);
    if (!email) return fail(401, 'Sign in with your approved email to use team AI.');
    try {
      if (url.pathname === '/api/me' && request.method === 'GET') return json(await me(env, email));
      if (url.pathname === '/api/words' && request.method === 'POST') return await words(request, env, email);
      if (url.pathname === '/api/image' && request.method === 'POST') return await image(request, env, email);
      if (url.pathname === '/api/scan' && request.method === 'POST') return await scan(request, env, email);
      if (url.pathname === '/api/usage' && request.method === 'GET') return await usage(env, email);
      if (url.pathname === '/api/stats' && request.method === 'POST') return await saveStats(request, env, email);
      if (url.pathname === '/api/team-stats' && request.method === 'GET') return await teamStats(env, email);
      if (url.pathname === '/api/team-rank' && request.method === 'GET') return await teamRank(env, email);
      if (url.pathname === '/api/push-reg' && request.method === 'POST') return await pushReg(request, env, email);
      if (url.pathname === '/api/push-off' && request.method === 'POST') return await pushOff(request, env, email);
      if (url.pathname === '/api/push-test' && request.method === 'POST') return await pushTest(env, email, ctx);
      if (url.pathname === '/api/name' && request.method === 'POST') return await saveName(request, env, email);
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
      messages: [{ role: 'system', content: body.kind === 'prospects' ? PROSPECT_RULES : SCAN_RULES }, { role: 'user', content: [{ type: 'text', text: 'Read this list.' }, { type: 'image_url', image_url: { url: img, detail: 'high' } }] }] })
  });
  const text = await r.text();
  if (!r.ok) return fail(502, openaiError(r.status, text));
  await addUse(env, day, email, 'scans');
  return passOn(text);
}

// prospects for 定联: names of people the agent knows, read from a chat list, contacts, followers, name card or handwritten list
const PROSPECT_RULES = `You read one screenshot or photo that lists people an insurance agent knows, for example a WhatsApp chat list, phone contacts, Instagram or Facebook followers/friends, a name card, or a handwritten name list.
Return JSON only: {"rows": [{"name": "", "platform": ""}], "note": ""}
- One entry per person you can read. Copy each name exactly as shown (nicknames and emojis are fine); do not translate, complete or guess.
- platform: "whatsapp", "instagram", "facebook", "contacts" or "other", judged from the app shown; "" if unclear.
- Skip group chats, channels, businesses, brand pages, the phone owner's own profile, and names that are cut off.
- Never output phone numbers, emails, addresses, message text or anything else about the person.
- note: one short sentence if the image has no people list or is unreadable; otherwise "".`;

/* ---------- 定联 numbers per agent per week: counts only, never prospect names ---------- */
const weekStart = (offsetWeeks = 0) => { // Monday of this week (Malaysia time), as YYYY-MM-DD
  const d = new Date(Date.now() + 8 * 3600e3); const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day - 7 * offsetWeeks); return d.toISOString().slice(0, 10);
};
const cnt = v => Math.max(0, Math.min(100000, Math.round(Number(v) || 0)));
async function saveStats(request, env, email) {
  const body = await request.json().catch(() => null);
  const allowed = [weekStart(0), weekStart(1), weekStart(2)];
  const weeks = Array.isArray(body && body.weeks) ? body.weeks.filter(w => w && allowed.includes(w.week)) : [];
  if (!weeks.length) return fail(400, 'No weekly numbers to save.');
  const name = String((body && body.name) || '').slice(0, 40);
  for (const w of weeks) {
    const g = k => ({ A: cnt(w[k] && w[k].A), B: cnt(w[k] && w[k].B), C: cnt(w[k] && w[k].C), D: cnt(w[k] && w[k].D) });
    const rec = { email, name, week: w.week, updated: new Date().toISOString(), touches: cnt(w.touches), byGroup: g('byGroup'), prospects: g('prospects'),
      opens: cnt(w.opens), presents: cnt(w.presents), closes: cnt(w.closes), noc: cnt(w.noc), anp: Math.max(0, Math.min(1e8, Number(w.anp) || 0)), activeDays: cnt(w.activeDays) };
    await env.USAGE.put(`w:${w.week}:${email}`, JSON.stringify(rec), { expirationTtl: 60 * 60 * 24 * 120 });
  }
  const rem = cleanReminders(body && body.reminders);
  if (rem) { const p = await getPush(env, email); p.rem = rem; p.name = name; await env.USAGE.put(`p:${email}`, JSON.stringify(p)); }
  return json({ ok: true });
}
// counts per date only: { day, dueBy: {YYYY-MM-DD: n}, occ: {MM-DD: {b, a}}, doneToday, targetToday }
function cleanReminders(r) {
  if (!r || !/^\d{4}-\d{2}-\d{2}$/.test(r.day || '')) return null;
  const dueBy = {}, occ = {};
  Object.entries(r.dueBy || {}).slice(0, 120).forEach(([d, n]) => { if (/^\d{4}-\d{2}-\d{2}$/.test(d)) dueBy[d] = cnt(n); });
  Object.entries(r.occ || {}).slice(0, 400).forEach(([d, v]) => { if (/^\d{2}-\d{2}$/.test(d)) occ[d] = { b: cnt(v && v.b), a: cnt(v && v.a) }; });
  return { day: r.day, dueBy, occ, doneToday: cnt(r.doneToday), targetToday: cnt(r.targetToday) };
}
// team ranking for agents: names and number of 定联 chats this week only (effort, never sales)
async function teamRank(env, email) {
  const page = await env.USAGE.list({ prefix: `w:${weekStart(0)}:` }), rows = [];
  for (const k of page.keys) { const r = await env.USAGE.get(k.name, 'json'); if (r) rows.push({ name: (await nameOf(env, r.email, r.name)) || 'Agent', touches: r.touches, me: r.email === email }); }
  rows.sort((a, b) => b.touches - a.touches);
  return json({ rows, myRank: rows.findIndex(r => r.me) + 1 });
}

/* ---------- lock-screen pop-ups via Firebase Cloud Messaging (same Firebase project as the team calendar) ---------- */
const getPush = async (env, email) => (await env.USAGE.get(`p:${email}`, 'json')) || { tokens: [], hour: 9, nudge: true, sent: {} };
async function pushReg(request, env, email) {
  const body = await request.json().catch(() => null);
  const token = String((body && body.token) || '');
  if (!token || token.length > 4096) return fail(400, 'No pop-up address from this phone.');
  const p = await getPush(env, email);
  p.tokens = [token, ...p.tokens.filter(t => t !== token)].slice(0, 5); // up to 5 phones per agent
  const hour = Number(body.hour); if (Number.isInteger(hour) && hour >= 6 && hour <= 22) p.hour = hour;
  if (typeof body.nudge === 'boolean') p.nudge = body.nudge;
  await env.USAGE.put(`p:${email}`, JSON.stringify(p));
  return json({ ok: true, phones: p.tokens.length });
}
async function pushOff(request, env, email) {
  const body = await request.json().catch(() => ({}));
  const p = await getPush(env, email);
  p.tokens = p.tokens.filter(t => t !== String(body.token || ''));
  await env.USAGE.put(`p:${email}`, JSON.stringify(p));
  return json({ ok: true });
}
async function pushTest(env, email, ctx) {
  const p = await getPush(env, email);
  if (!p.tokens.length) return fail(400, 'Turn on pop-ups on this phone first.');
  if (!env.FCM_SERVICE_ACCOUNT) return fail(503, 'Pop-ups aren’t set up on the team server yet. Tell your team leader.');
  ctx.waitUntil((async () => { await new Promise(r => setTimeout(r, 15000)); await sendAll(env, email, p, '🔔 Test pop-up', `It works! ${[dailyText(p.rem), occasionText(p.rem)].filter(Boolean).join(' · ') || 'Your reminders will look like this.'}`); })());
  return json({ ok: true });
}
const mytNow = () => new Date(Date.now() + 8 * 3600e3);
function dailyText(rem) {
  if (!rem) return '';
  const now = mytNow(), today = now.toISOString().slice(0, 10), md = today.slice(5);
  const dueCount = Object.entries(rem.dueBy || {}).reduce((n, [d, c]) => n + (d <= today ? c : 0), 0);
  return dueCount ? `${dueCount} prospect${dueCount === 1 ? '' : 's'} due for a chat` : '';
}
// customer birthdays and policy anniversaries today, plus tomorrow's as a heads-up (counts only)
function occasionText(rem) {
  if (!rem) return '';
  const now = mytNow(), md = now.toISOString().slice(5, 10), tm = new Date(now.getTime() + 864e5).toISOString().slice(5, 10);
  const say = o => [o.b && `${o.b} birthday${o.b === 1 ? '' : 's'} 🎂`, o.a && `${o.a} policy anniversar${o.a === 1 ? 'y' : 'ies'} 🤝`].filter(Boolean).join(' and ');
  const t = say((rem.occ || {})[md] || {}), n = say((rem.occ || {})[tm] || {});
  return [t && `Today: ${t}. Tap to wish them or skip.`, n && `Tomorrow: ${n}.`].filter(Boolean).join(' ');
}
async function hourlyReminders(env) {
  if (!env.FCM_SERVICE_ACCOUNT) return;
  const now = mytNow(), hour = now.getUTCHours(), today = now.toISOString().slice(0, 10);
  let cursor;
  do {
    const page = await env.USAGE.list({ prefix: 'p:', cursor });
    for (const k of page.keys) {
      const p = await env.USAGE.get(k.name, 'json'); if (!p || !p.tokens || !p.tokens.length) continue;
      const email = k.name.slice(2); p.sent = p.sent || {};
      let changed = false;
      if (hour === (p.hour || 9) && p.sent.daily !== today) {
        const occ = occasionText(p.rem);
        if (occ) await sendAll(env, email, p, '🎂 Customer occasions', occ, '#customers');
        const text = dailyText(p.rem);
        if (text) await sendAll(env, email, p, '定联 time', `${text}. Open the app for today’s 3-3-2-1.`);
        p.sent.daily = today; changed = true;
      }
      if (hour === 21 && p.nudge !== false && p.sent.nudge !== today) {
        const r = p.rem || {}, done = r.day === today ? r.doneToday : 0, target = r.targetToday || 9;
        if (done < target) await sendAll(env, email, p, '定联 reminder', done ? `You’ve done ${done} of ${target} today. ${target - done} more to keep your streak!` : `No 定联 yet today. Even one chat keeps your streak going.`);
        p.sent.nudge = today; changed = true;
      }
      if (changed) await env.USAGE.put(k.name, JSON.stringify(p));
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
}
async function sendAll(env, email, p, title, body, url = '#routine') {
  const keep = [];
  for (const token of p.tokens) {
    const r = await fcmSend(env, token, title, body, url);
    if (r !== 'gone') keep.push(token);
  }
  if (keep.length !== p.tokens.length) { p.tokens = keep; await env.USAGE.put(`p:${email}`, JSON.stringify(p)); }
}
let fcmAuth = null;
async function fcmAccessToken(env) { // Google service-account sign-in (JWT signed here with WebCrypto), cached ~50 minutes
  if (fcmAuth && fcmAuth.exp > Date.now() + 60e3) return fcmAuth;
  const sa = JSON.parse(env.FCM_SERVICE_ACCOUNT);
  const enc = o => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)));
  const jwt = `${unsigned}.${btoa(String.fromCharCode(...sig)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}`;
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}` });
  const j = await r.json();
  if (!j.access_token) throw new Error('Firebase sign-in failed');
  fcmAuth = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000, project: sa.project_id };
  return fcmAuth;
}
async function fcmSend(env, token, title, body, url = '#routine') {
  try {
    const auth = await fcmAccessToken(env);
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${auth.project}/messages:send`, {
      method: 'POST', headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { token, data: { title, body, url, tag: url === '#customers' ? 'occasions' : 'dinglian' }, webpush: { headers: { Urgency: 'high', TTL: '43200' } } } })
    });
    if (r.ok) return 'ok';
    const t = await r.text();
    return r.status === 404 || /UNREGISTERED/.test(t) ? 'gone' : 'failed';
  } catch { return 'failed'; }
}
// each agent's display name (from Me on their phone), so team tables never show email addresses
async function saveName(request, env, email) {
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').replace(/s+/g, ' ').trim().slice(0, 40);
  if (name) await env.USAGE.put(`n:${email}`, name); else await env.USAGE.delete(`n:${email}`);
  return json({ ok: true });
}
const nameOf = async (env, email, fallback) => (await env.USAGE.get(`n:${email}`)) || fallback || '';
async function teamStats(env, email) {
  if (!isOwner(env, email)) return fail(403, 'Only the team owner can see team numbers.');
  const out = {};
  for (const [label, week] of [['thisWeek', weekStart(0)], ['lastWeek', weekStart(1)]]) {
    const page = await env.USAGE.list({ prefix: `w:${week}:` });
    out[label] = { week, agents: [] };
    for (const k of page.keys) { const r = await env.USAGE.get(k.name, 'json'); if (r) { r.name = await nameOf(env, r.email, r.name); delete r.email; out[label].agents.push(r); } }
    out[label].agents.sort((a, b) => b.touches - a.touches);
  }
  return json(out);
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
    team: await getUse(env, day, '_team'), agents: (await Promise.all(Object.values(rows).map(async r => { const { email: who, ...rest } = r; return Object.assign(rest, { name: await nameOf(env, who) }); }))).sort((a, b) => b.month - a.month) });
}
