// Quick check of the 定联 server routes without Cloudflare: node test/routine-api.test.mjs
import worker from '../src/worker.js';

const kv = new Map();
const USAGE = {
  async get(k, type) { const v = kv.get(k); return v == null ? null : type === 'json' ? JSON.parse(v) : v; },
  async put(k, v) { kv.set(k, v); },
  async list({ prefix }) { return { keys: [...kv.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }; }
};
let sentToAi = '';
globalThis.fetch = async (url, opts) => { // stand-in for OpenAI
  sentToAi = String(opts.body);
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ rows: [{ name: 'Daniel Ooi', platform: 'whatsapp' }], note: '' }) } }] }), { status: 200 });
};
const env = (email, owner) => ({ USAGE, ASSETS: {}, OPENAI_API_KEY: 'test', DEV_EMAIL: email, OWNER_EMAIL: owner, DAILY_SCANS: '20' });
const call = (path, e, body) => worker.fetch(new Request('http://localhost' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}), e);
const week = (() => { const d = new Date(Date.now() + 8 * 3600e3); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); })();
const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`);

let r = await call('/api/stats', env('agent1@x.com', 'boss@x.com'), { name: 'Agent One', weeks: [{ week, touches: 12, byGroup: { A: 1, B: 2, C: 4, D: 5 }, opens: 2, presents: 1, closes: 1, noc: 1, anp: 3600, activeDays: 4, prospects: { A: 3, B: 8, C: 20, D: 60 }, names: ['should not be stored'] }] });
check('agent saves weekly numbers', r.status === 200);
const stored = kv.get(`w:${week}:agent1@x.com`) || '';
check('no prospect names stored', !stored.includes('should not be stored'), stored.slice(0, 80));
r = await call('/api/stats', env('agent1@x.com', 'boss@x.com'), { weeks: [{ week: '2020-01-06', touches: 5 }] });
check('old weeks refused', r.status === 400);
r = await call('/api/team-stats', env('agent1@x.com', 'boss@x.com'));
check('agents cannot see the team', r.status === 403);
r = await call('/api/team-stats', env('boss@x.com', 'boss@x.com'));
const team = await r.json();
check('owner sees agent numbers', r.status === 200 && team.thisWeek.agents[0].touches === 12 && team.thisWeek.agents[0].anp === 3600, JSON.stringify(team.thisWeek.agents[0]).slice(0, 120));
r = await call('/api/scan', env('agent1@x.com', 'boss@x.com'), { kind: 'prospects', image: 'data:image/png;base64,iVBORw0KGgo=' });
const scan = await r.json();
check('prospect photo uses the names-only rules', sentToAi.includes('people an insurance agent knows') && sentToAi.includes('Never output phone numbers'));
check('prospect names come back', scan.choices && JSON.parse(scan.choices[0].message.content).rows[0].name === 'Daniel Ooi');
// --- ranking, pop-up sign-up, reminder counts and the hourly sender ---
const myt = new Date(Date.now() + 8 * 3600e3), todayStr = myt.toISOString().slice(0, 10), md = todayStr.slice(5);
await call('/api/stats', env('agent2@x.com', 'boss@x.com'), { name: 'Agent Two', weeks: [{ week, touches: 20 }],
  reminders: { day: todayStr, dueBy: { [todayStr]: 4, '2026-01-01': 2 }, occ: { [md]: { b: 1, a: 0 } }, doneToday: 3, targetToday: 9, names: ['nope'] } });
r = await call('/api/team-rank', env('agent1@x.com', 'boss@x.com'));
const rank = await r.json();
check('agents see team ranking by chats', rank.rows[0].name === 'Agent Two' && rank.rows[0].touches === 20 && rank.myRank === 2 && !('anp' in rank.rows[0]), JSON.stringify(rank));
check('reminder counts stored without names', !(kv.get('p:agent2@x.com') || '').includes('nope'));
r = await call('/api/push-reg', env('agent2@x.com', 'boss@x.com'), { token: 'tok-123', hour: myt.getUTCHours() < 6 || myt.getUTCHours() > 22 ? 9 : myt.getUTCHours(), nudge: true });
check('phone registers for pop-ups', r.status === 200);
// a throwaway service-account key, so the Google sign-in can be signed for real (but answered by the stub)
const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const pk = Buffer.from(await crypto.subtle.exportKey('pkcs8', kp.privateKey)).toString('base64');
const sa = JSON.stringify({ client_email: 'x@y.iam.gserviceaccount.com', project_id: 'redefine-calendar', private_key: `-----BEGIN PRIVATE KEY-----\n${pk.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n` });
const sent = [];
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('oauth2')) return new Response(JSON.stringify({ access_token: 'at', expires_in: 3600 }));
  sent.push(JSON.parse(opts.body).message); return new Response('{}');
};
const hourEnv = Object.assign(env('x', 'boss@x.com'), { FCM_SERVICE_ACCOUNT: sa });
const p = JSON.parse(kv.get('p:agent2@x.com')); p.hour = myt.getUTCHours(); kv.set('p:agent2@x.com', JSON.stringify(p));
let waits = [];
await worker.scheduled({}, hourEnv, { waitUntil: x => waits.push(x) }); await Promise.all(waits);
const daily = sent.find(m => m.data.title === '定联 time');
check('daily 定联 pop-up sent at the chosen hour', !!daily && daily.token === 'tok-123' && /6 prospects due/.test(daily.data.body), daily && daily.data.body);
const occ = sent.find(m => m.data.title === '🎂 Customer occasions');
check('separate customer birthday pop-up, opens Customers', !!occ && /Today: 1 birthday/.test(occ.data.body) && occ.data.url === '#customers', occ && occ.data.body);
sent.length = 0; waits = [];
await worker.scheduled({}, hourEnv, { waitUntil: x => waits.push(x) }); await Promise.all(waits);
check('daily pop-up not repeated the same day', !sent.some(m => m.data.title === '定联 time'));
console.log(results.join('\n'));
if (results.some(x => x.startsWith('FAIL'))) process.exit(1);
