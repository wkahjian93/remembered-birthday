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
console.log(results.join('\n'));
if (results.some(x => x.startsWith('FAIL'))) process.exit(1);
