// Cloud sync checks without Cloudflare: node test/sync.test.mjs
// A tiny stand-in for D1 that understands the two statements the sync route uses.
import worker from '../src/worker.js';

const table = new Map(); // "email|coll|id" -> row
const DB = {
  prepare(sql) {
    let args = [];
    const st = {
      bind(...a) { args = a; return st; },
      async run() {
        const [email, coll, id, data, u, deleted, su] = args, k = `${email}|${coll}|${id}`, old = table.get(k);
        if (!old || u > old.u) table.set(k, { email, coll, id, data, u, deleted, su });
      },
      async all() {
        const [email, since, limit] = args;
        const results = [...table.values()].filter(r => r.email === email && r.su > since).sort((a, b) => a.su - b.su).slice(0, limit);
        return { results };
      }
    };
    return st;
  },
  async batch(list) { for (const s of list) await s.run(); }
};
const env = email => ({ DB, ASSETS: {}, DEV_EMAIL: email, OWNER_EMAIL: 'boss@x.com' });
const sync = async (email, body) => (await worker.fetch(new Request('http://localhost/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env(email))).json();
const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`);

// phone saves two contacts
let r = await sync('a@x.com', { since: 0, changes: [{ coll: 'c', id: 'k1', u: 1000, data: { id: 'k1', nickname: 'Kelly' } }, { coll: 'p', id: 'p1', u: 1000, data: { id: 'p1', name: 'Jason' } }] });
check('phone pushes contacts', r.saved === 2 && r.rows.length === 2);
// laptop (fresh) gets them
r = await sync('a@x.com', { since: 0, changes: [] });
check('laptop receives the same contacts', r.rows.some(x => x.id === 'k1' && x.data.nickname === 'Kelly') && r.rows.some(x => x.coll === 'p'));
const cur = r.cursor;
// another agent sees nothing of agent a
r = await sync('b@x.com', { since: 0, changes: [] });
check('another agent cannot see them', r.rows.length === 0);
// laptop edits Kelly; an older edit from the phone must not overwrite it
await sync('a@x.com', { since: cur, changes: [{ coll: 'c', id: 'k1', u: 3000, data: { id: 'k1', nickname: 'Kelly Tan' } }] });
await sync('a@x.com', { since: cur, changes: [{ coll: 'c', id: 'k1', u: 2000, data: { id: 'k1', nickname: 'Kel' } }] });
r = await sync('a@x.com', { since: 0, changes: [] });
check('newer change wins', r.rows.find(x => x.id === 'k1').data.nickname === 'Kelly Tan');
// delete reaches the other devices
await sync('a@x.com', { since: 0, changes: [{ coll: 'p', id: 'p1', u: 4000, deleted: true }] });
r = await sync('a@x.com', { since: cur, changes: [] });
check('deleted prospect is passed on as deleted', r.rows.some(x => x.id === 'p1' && x.deleted && x.data === null));
// junk is refused
r = await sync('a@x.com', { since: 0, changes: [{ coll: 'x', id: 'bad', u: 1, data: 1 }, { coll: 'c', id: '', u: 1, data: 1 }] });
check('unknown collections and empty ids are skipped', r.skipped === 2 && r.saved === 0);
// not signed in
const anon = await worker.fetch(new Request('http://localhost/api/sync', { method: 'POST', body: '{}' }), { DB, ASSETS: {} });
check('no sign-in, no sync', anon.status === 401);

console.log(results.join('\n'));
if (results.some(x => x.startsWith('FAIL'))) process.exit(1);
