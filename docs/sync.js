/* Cloud sync for the Customer Relationship App: the same contacts, 定联 prospects and Me details on phone, iPad and laptop.
   Works only on the team site (signed in), through the team server's /api/sync, under the agent's own email.
   How: every record has a fingerprint of what the server last saw. A record whose fingerprint changed is sent up
   (with this device's time; the newer change wins); a record that disappeared is sent as deleted. The server then
   returns everything other devices changed since the last sync, which is written into this device.
   Never synced: the OpenAI key, made-up example records, push-notification registration. */
(function () {
  const K_SNAP = 'remembered.sync.snap.v1', K_CUR = 'remembered.sync.cursor.v1', K_AT = 'remembered.sync.at';
  const OVERLAP = 8e6; // ask again for the last 8 seconds of server writes, in case two devices wrote at the same moment
  let snap = store.get(K_SNAP, {}), cursor = store.get(K_CUR, 0), running = false, again = false, timer = null, lastErr = '';

  const fp = v => { const s = JSON.stringify(v); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + '.' + s.length; };
  const SETTING_KEYS = s => Object.keys(s).filter(k => !['apiKey', 'photo', 'cakePhoto', 'lastBackup'].includes(k));

  // everything on this device that should be the same everywhere, as "coll:id" -> record
  function collect() {
    const out = {};
    customers.filter(c => c && c.id && !c.sample).forEach(c => { out['c:' + c.id] = c; });
    (store.get(KEY_P, []) || []).filter(p => p && p.id && !p.sample).forEach(p => { out['p:' + p.id] = p; });
    const rt = store.get(KEY_R, null); if (rt) out['m:routine'] = rt;
    out['m:settings'] = Object.fromEntries(SETTING_KEYS(settings).map(k => [k, settings[k]]));
    if (settings.photo) out['m:photo'] = { v: settings.photo };
    if (settings.cakePhoto) out['m:cake'] = settings.cakePhoto;
    return out;
  }

  // write records that came from another device into this one
  function apply(rows) {
    let cust = false, pros = false, me = false;
    const prospects = store.get(KEY_P, []) || [];
    for (const r of rows) {
      const k = r.coll + ':' + r.id;
      if (r.coll === 'c') {
        const i = customers.findIndex(c => c.id === r.id);
        if (r.deleted) { if (i >= 0) customers.splice(i, 1); } else if (i >= 0) customers[i] = r.data; else customers.push(r.data);
        cust = true;
      } else if (r.coll === 'p') {
        const i = prospects.findIndex(p => p.id === r.id);
        if (r.deleted) { if (i >= 0) prospects.splice(i, 1); } else if (i >= 0) prospects[i] = r.data; else prospects.push(r.data);
        pros = true;
      } else if (r.coll === 'm') {
        if (r.id === 'routine' && !r.deleted) { store.set(KEY_R, r.data); pros = true; }
        if (r.id === 'settings' && !r.deleted) { const keep = { apiKey: settings.apiKey, photo: settings.photo, cakePhoto: settings.cakePhoto, lastBackup: settings.lastBackup };
          Object.keys(settings).forEach(x => { if (!(x in keep)) delete settings[x]; }); Object.assign(settings, DEFAULT_SETTINGS, r.data, keep); me = true; }
        if (r.id === 'photo') { settings.photo = r.deleted ? '' : (r.data && r.data.v) || ''; me = true; }
        if (r.id === 'cake') { settings.cakePhoto = r.deleted ? null : r.data; me = true; }
      }
      if (r.deleted) delete snap[k]; else snap[k] = fp(r.data);
    }
    if (cust) store.set(KEY_C, customers);
    if (pros) store.set(KEY_P, prospects);
    if (me) store.set(KEY_S, settings);
    return { cust, pros, me };
  }

  function redraw(ch) {
    if (ch.cust) { if (!$('#view-customers').hidden) renderCustomers(); if (!$('#view-create').hidden && !busy) renderCreate(); }
    if (ch.pros && window.routineReload) window.routineReload();
    if (ch.me && typeof loadSettingsForm === 'function' && $('#view-settings') && $('#view-settings').hidden) loadSettingsForm();
  }

  async function run() {
    if (!team) return; // only on the signed-in team site
    if (running) { again = true; return; }
    running = true; clearTimeout(timer); timer = null;
    try {
      // 0) the first sync on a device: take everything already on the server first (the server wins), so a new or
      //    reinstalled device never overwrites real data with its empty defaults; then only its own extra records go up
      if (!store.get(K_AT, 0)) {
        let since = 0, changed = { cust: false, pros: false, me: false };
        for (let page = 0; page < 50; page++) {
          const r = await fetch('api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ since, changes: [] }) });
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Sync failed (${r.status}).`);
          const j = await r.json(), ch = apply(j.rows);
          Object.keys(ch).forEach(x => { changed[x] = changed[x] || ch[x]; });
          cursor = Math.max(cursor, j.cursor); since = j.cursor;
          if (!j.more) break;
        }
        store.set(K_SNAP, snap); store.set(K_CUR, cursor); store.set(K_AT, Date.now());
        redraw(changed);
      }
      // 1) what changed here since the server last saw it
      const now = collect(), changes = [], t = Date.now();
      for (const [k, v] of Object.entries(now)) { const f = fp(v); if (snap[k] !== f) changes.push({ k, f, coll: k[0], id: k.slice(2), u: t, data: v }); }
      for (const k of Object.keys(snap)) if (!(k in now)) changes.push({ k, coll: k[0], id: k.slice(2), u: t, deleted: true });
      // 2) send them, then fetch what other devices changed (page by page)
      let since = Math.max(0, cursor - OVERLAP), first = true, changed = { cust: false, pros: false, me: false };
      for (let page = 0; page < 50; page++) {
        const body = { since, changes: first ? changes.map(({ k, f, ...c }) => c) : [] };
        const r = await fetch('api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Sync failed (${r.status}).`);
        const j = await r.json();
        if (first) { changes.forEach(c => { if (c.deleted) delete snap[c.k]; else snap[c.k] = c.f; }); first = false; }
        // rows we just sent come straight back; only apply the ones that differ from this device
        const mine = collect();
        const theirs = j.rows.filter(row => { const k = row.coll + ':' + row.id; return row.deleted ? (k in mine) : fp(row.data) !== fp(mine[k] === undefined ? null : mine[k]); });
        const ch = apply(theirs); Object.keys(ch).forEach(x => { changed[x] = changed[x] || ch[x]; });
        j.rows.forEach(row => { const k = row.coll + ':' + row.id; if (row.deleted) delete snap[k]; else snap[k] = fp(row.data); });
        cursor = Math.max(cursor, j.cursor); since = j.cursor;
        if (!j.more) break;
      }
      store.set(K_SNAP, snap); store.set(K_CUR, cursor); store.set(K_AT, Date.now()); lastErr = '';
      redraw(changed);
    } catch (e) { lastErr = e.message || 'Offline'; }
    finally { running = false; showState(); if (again) { again = false; syncSoon(1500); } }
  }

  function syncSoon(ms = 2500) { if (!team) return; clearTimeout(timer); timer = setTimeout(run, ms); }
  function showState() {
    const at = store.get(K_AT, 0), el = document.querySelectorAll('[data-syncstate]');
    const ago = at ? Math.round((Date.now() - at) / 60000) : null;
    const text = !team ? 'Cloud sync works on the team link after you sign in.'
      : lastErr ? `☁️ Sync paused: ${lastErr} It tries again automatically.`
      : at ? `☁️ Synced ${ago < 1 ? 'just now' : ago < 60 ? `${ago} min ago` : new Date(at).toLocaleString()}. Same contacts on your phone, iPad and laptop.` : '☁️ Syncing…';
    el.forEach(x => { x.textContent = text; x.style.color = lastErr ? 'var(--warn)' : ''; });
  }

  window.syncSoon = syncSoon;
  window.syncNow = () => run();
  window.syncState = showState;
  // first sync once the team sign-in is known; then whenever the app comes back to the front, and every minute while open
  let tries = 0; const start = setInterval(() => { if (team || ++tries > 30) { clearInterval(start); showState(); run(); } }, 500);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncSoon(300); });
  setInterval(() => { if (!document.hidden) run(); }, 60000);
  window.addEventListener('online', () => syncSoon(300));
})();
