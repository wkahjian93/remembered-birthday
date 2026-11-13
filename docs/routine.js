// Routine Engagement (定联): ABCD prospects, who to talk to today, quick logging (one or many at once),
// editable history, open/present/close results, motivation, and lock-screen reminders.
// Uses the main app's helpers ($, esc, ask, toast, store, uid, today0, MONTHS, team, callJson, loadTeam, aiReady,
// settings, downscale, customers, nextBirthday, nextAnniversary).
'use strict';
(() => {
  const KEY_P = 'remembered.prospects.v1', KEY_R = 'remembered.routine.v1';
  const GROUPS = ['A', 'B', 'C', 'D'];
  const GROUP_INFO = { A: '挺你到底的好朋友', B: '好友，聊私人心事', C: '三分熟，很久不见', D: '认识，有联络方式' };
  const PLATFORMS = [['whatsapp', 'WhatsApp'], ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['call', 'Call'], ['meet', 'Met up'], ['other', 'Other']];
  const QUICK_NOTES = ['Replied story', 'Commented post', 'Liked post', 'Chatted', 'Sent info', 'Festival greeting', 'Voice note'];
  const STAGES = [['open', '🔓 Opened'], ['present', '📊 Presented'], ['close', '✅ Closed']];
  const stageWord = k => ({ open: 'Opened', present: 'Presented', close: 'Closed' })[k];
  const DEFAULTS = { gaps: { A: 7, B: 21, C: 42, D: 56 }, target: { A: 1, B: 2, C: 3, D: 3 }, celebrated: '', pushHour: 9, nudge9pm: true };
  const rset = Object.assign({}, DEFAULTS, store.get(KEY_R, {}));
  const saveSet = () => store.set(KEY_R, rset);
  const dayStr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fromStr = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const todayStr = () => dayStr(today0());
  const key = s => String(s || '').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
  const platName = k => (PLATFORMS.find(x => x[0] === k) || [k, k || 'Chat'])[1];
  const validDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && s <= todayStr() && s >= '2000-01-01';

  let prospects = store.get(KEY_P, null);
  if (!Array.isArray(prospects)) { // made-up examples so the first screen shows how it works
    const t = today0(), ago = n => dayStr(addDays(t, -n));
    prospects = [
      { name: 'Jason (ex-colleague)', group: 'D', platform: 'whatsapp', star: false, remark: 'Just changed job to Shopee', created: ago(70), touches: [{ date: ago(60), platform: 'whatsapp', note: 'Congrats on new job' }] },
      { name: 'Aunty Lily', group: 'C', platform: 'facebook', star: false, remark: '', created: ago(50), touches: [{ date: ago(45), platform: 'facebook', note: 'Reacted to her cooking post' }] },
      { name: 'Wei Ming', group: 'B', platform: 'instagram', star: true, remark: 'Getting married in March. Ask about wedding prep.', created: ago(40), touches: [{ date: ago(22), platform: 'instagram', note: 'Replied story, honeymoon in Japan' }] },
      { name: 'Sarah Tan', group: 'A', platform: 'whatsapp', star: true, remark: 'Asked about medical card for her mum', created: ago(30), touches: [{ date: ago(8), platform: 'meet', note: 'Coffee, talked about her mum’s health' }], results: [{ date: ago(8), stage: 'open' }] },
      { name: 'Hafiz', group: 'D', platform: 'instagram', star: false, remark: '', created: ago(3), touches: [] }
    ].map(p => Object.assign({ id: uid(), sample: true, results: [], groupHistory: [] }, p));
  }
  prospects.forEach(p => { // every record gets an id (needed to edit it) and lastTouch always matches the history
    (p.touches || []).forEach(t => { t.id = t.id || uid(); });
    (p.results || []).forEach(r => { r.id = r.id || uid(); });
    fixLast(p);
  });
  store.set(KEY_P, prospects);
  function fixLast(p) {
    const ts = (p.touches || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    p.lastTouch = ts.length ? ts[ts.length - 1].date : '';
    if (ts.length) p.platform = ts[ts.length - 1].platform || p.platform;
  }
  const save = () => { const ok = store.set(KEY_P, prospects); markDirty(); return ok; };

  /* ---------- who is due ---------- */
  function due(p) { // days until next chat: 0 or less means talk now; never-contacted prospects are due today
    if (!p.lastTouch) return { days: 0, fresh: true };
    const next = addDays(fromStr(p.lastTouch), rset.gaps[p.group] || 56);
    return { days: Math.round((next - today0()) / 864e5), next };
  }
  const touchedToday = p => (p.touches || []).some(t => t.date === todayStr());
  const touchesOn = d => prospects.reduce((n, p) => n + (p.touches || []).filter(t => t.date === d).length, 0);
  function todayPlan() {
    const plan = {};
    GROUPS.forEach(g => {
      const inG = prospects.filter(p => p.group === g);
      const done = inG.filter(touchedToday);
      const left = inG.filter(p => !touchedToday(p)).map(p => ({ p, d: due(p) }))
        .sort((a, b) => (b.p.star - a.p.star) || (a.d.days - b.d.days));
      const target = Math.min(rset.target[g] || 0, inG.length); // a group with fewer people than the target can still be completed
      const need = Math.max(0, target - done.length);
      const dueNow = left.filter(x => x.d.days <= 0);
      const picks = dueNow.slice(0, need);
      if (picks.length < need) picks.push(...left.filter(x => x.d.days > 0).slice(0, need - picks.length).map(x => Object.assign({ early: true }, x)));
      plan[g] = { done: done.length, target, picks, dueCount: dueNow.length, total: inG.length };
    });
    return plan;
  }
  const doneTotalOf = plan => GROUPS.reduce((n, g) => n + Math.min(plan[g].done, plan[g].target), 0);
  const targetTotalOf = plan => GROUPS.reduce((n, g) => n + plan[g].target, 0);
  function streak() { // days in a row with at least one 定联 (today counts once you've done one)
    let n = 0, d = today0();
    if (!touchesOn(dayStr(d))) d = addDays(d, -1);
    while (touchesOn(dayStr(d)) > 0) { n++; d = addDays(d, -1); }
    return n;
  }
  const chatIdea = p => { // light, no-sales openers: their own remark first, else this month's occasion
    const m = today0().getMonth();
    const month = ['New Year plans, CNY coming', 'CNY greetings and reunion', 'Ramadan wishes, school term', 'Raya plans, holidays', 'Labour Day, Wesak, Mother’s Day', 'Father’s Day, mid-year holidays',
      'school holidays, travel', 'Merdeka month', 'Malaysia Day, mid-autumn mooncakes', 'Deepavali, year-end plans', 'year-end holidays, Deepavali', 'Christmas, year-end plans'][m];
    return p.remark ? `Ask about: ${p.remark}` : `This month: ${month}. Or reply to their latest story.`;
  };

  /* ---------- styles for this tab ---------- */
  const css = document.createElement('style');
  css.textContent = `
  .gbadge { display:inline-grid; place-items:center; width:28px; height:28px; border-radius:8px; font-weight:800; font-size:14px; color:#fff; flex:none; }
  .gA { background:#1f7a4d } .gB { background:#2f5fb3 } .gC { background:#b7791f } .gD { background:#7a6b80 }
  .re-search { position:sticky; top:calc(env(safe-area-inset-top,0px) + 58px); z-index:4; background:var(--bg); padding-block:6px; }
  .re-search input { width:100%; border:1px solid var(--line); background:var(--surface); font-size:16px; border-radius:999px; padding:12px 16px; }
  .re-hero { display:grid; grid-template-columns:auto 1fr; gap:14px; align-items:center; }
  .ring { width:96px; height:96px; }
  .ring text { font-family:var(--display); fill:var(--ink); }
  .progress-row { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; }
  .gprog { border:1px solid var(--line); border-radius:12px; padding:6px; text-align:center; background:var(--bg); color:var(--ink); font:inherit; }
  .gprog b { font-family:var(--display); font-weight:400; font-size:19px; font-variant-numeric:tabular-nums; }
  .gprog.met { border-color:var(--ok); background:var(--ok-bg); }
  .pick { border:1px solid var(--line); border-radius:14px; padding:12px; display:grid; gap:8px; background:var(--surface); }
  .pick .head { display:flex; gap:10px; align-items:center; }
  .pick .head b { flex:1 1 auto; min-width:0; overflow-wrap:anywhere; font-size:16px; }
  .pick .meta { font-size:13px; color:var(--muted); }
  .pick .idea { font-size:13.5px; background:var(--surface-2); border-radius:10px; padding:8px 10px; }
  .starbtn { background:none; border:0; font-size:22px; cursor:pointer; line-height:1; padding:4px; color:var(--muted); }
  .starbtn.on { color:#e0a100; }
  .chipset { display:flex; flex-wrap:wrap; gap:6px; }
  .chipset button { border:1px solid var(--line); background:var(--bg); color:var(--ink); border-radius:999px; padding:6px 11px; font-size:13px; font-weight:600; cursor:pointer; }
  .chipset button.on { border-color:var(--accent); color:var(--accent); background:color-mix(in srgb, var(--accent) 10%, transparent); }
  .re-tabs { display:grid; grid-template-columns:1fr 1fr; gap:6px; background:var(--surface-2); border-radius:12px; padding:4px; }
  .re-tabs button { border:0; background:transparent; border-radius:9px; padding:9px; font-weight:800; color:var(--muted); cursor:pointer; }
  .re-tabs button.on { background:var(--surface); color:var(--ink); box-shadow:0 1px 4px rgba(0,0,0,.08); }
  .plist-row { display:grid; grid-template-columns:auto 28px 1fr auto; gap:10px; align-items:center; padding:10px 2px; border-bottom:1px solid var(--line); }
  .plist-row:last-child { border-bottom:0; }
  .plist-row .n { min-width:0; overflow-wrap:anywhere; font-weight:700; cursor:pointer; }
  .plist-row .s { font-size:12.5px; color:var(--muted); font-weight:500; }
  .plist-row input[type=checkbox] { width:22px; height:22px; accent-color:var(--accent); }
  .bulkbar { position:fixed; left:0; right:0; bottom:calc(64px + env(safe-area-inset-bottom,0px)); z-index:7; background:var(--ink); color:var(--bg);
    padding:10px max(16px, env(safe-area-inset-left,0px)); display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .bulkbar b { flex:1 1 auto; white-space:nowrap; }
  #reBody { padding-bottom:70px; }
  .bulkbar button { border:0; border-radius:10px; padding:8px 10px; font-weight:800; cursor:pointer; background:var(--bg); color:var(--ink); }
  .stat-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
  .stat { border:1px solid var(--line); border-radius:12px; padding:8px 10px; background:var(--bg); }
  .stat b { display:block; font-family:var(--display); font-weight:400; font-size:21px; font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }
  .stat span { font-size:12px; color:var(--muted); font-weight:700; }
  .badges { display:flex; flex-wrap:wrap; gap:6px; }
  .badge { border-radius:999px; padding:5px 10px; font-size:12.5px; font-weight:700; background:var(--surface-2); color:var(--muted); }
  .badge.got { background:color-mix(in srgb, var(--gold) 25%, transparent); color:var(--ink); }
  .sheet-back { position:fixed; inset:0; z-index:20; background:rgba(20,8,20,.55); display:grid; align-items:end; justify-items:center; padding:12px; padding-bottom:calc(12px + env(safe-area-inset-bottom,0px)); }
  .sheet { background:var(--surface); border-radius:18px; padding:16px; width:min(560px,100%); max-height:90vh; overflow:auto; display:grid; gap:12px; }
  .seg-g { display:flex; gap:6px; }
  .seg-g button { flex:1; border:1px solid var(--line); background:var(--bg); color:var(--ink); border-radius:10px; padding:8px 0; font-weight:800; cursor:pointer; }
  .seg-g button.on { color:#fff; border-color:transparent; }
  .hist { display:grid; gap:6px; }
  .hist-row { display:grid; grid-template-columns:1fr auto; gap:8px; align-items:start; border-left:3px solid var(--line); padding-left:8px; font-size:13.5px; }
  .hist-row button { border:1px solid var(--line); background:var(--bg); border-radius:8px; padding:4px 8px; font-size:12.5px; cursor:pointer; color:var(--ink); }
  .rank { display:grid; gap:4px; font-size:13.5px; }
  .rank div { display:grid; grid-template-columns:28px 1fr auto; gap:8px; padding:6px 8px; border-radius:8px; background:var(--bg); }
  .rank div.me { background:color-mix(in srgb, var(--accent) 12%, transparent); font-weight:800; }
  .team-table { width:100%; border-collapse:collapse; font-size:13px; font-variant-numeric:tabular-nums; }
  .team-table th, .team-table td { padding:6px 4px; border-bottom:1px solid var(--line); text-align:center; }
  .team-table th:first-child, .team-table td:first-child { text-align:left; }
  #reConfetti { position:fixed; inset:0; pointer-events:none; z-index:40; }`;
  document.head.appendChild(css);

  /* ---------- motivation: confetti and sounds ---------- */
  let audio = null;
  function chime(kind) { // short happy sound made on the phone (no files); 'goal' rises, 'close' is a cash-register ding
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const notes = kind === 'close' ? [1046.5, 1318.5, 1568, 2093] : kind === 'up' ? [659.3, 880, 1174.7] : [523.3, 659.3, 784, 1046.5];
      notes.forEach((f, i) => {
        const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + i * 0.11;
        o.type = 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.4);
      });
    } catch {}
  }
  function confetti() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = document.createElement('canvas'); c.id = 'reConfetti'; c.width = innerWidth; c.height = innerHeight; document.body.appendChild(c);
    const g = c.getContext('2d'), cols = ['#e0a100', '#a8285f', '#1f7a4d', '#2f5fb3', '#f06ba8'];
    const bits = Array.from({ length: 120 }, () => ({ x: innerWidth / 2, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 12 - 4, r: Math.random() * 6, c: cols[Math.floor(Math.random() * 5)], s: 5 + Math.random() * 6 }));
    let f = 0;
    const tick = () => {
      g.clearRect(0, 0, c.width, c.height);
      bits.forEach(b => { b.vy += 0.35; b.x += b.vx; b.y += b.vy; b.r += 0.2; g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.fillStyle = b.c; g.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2); g.restore(); });
      if (++f < 110) requestAnimationFrame(tick); else c.remove();
    };
    tick();
  }
  const celebrate = (kind, msg) => { confetti(); chime(kind); if (msg) toast(msg); };
  function checkGoal() { // once a day, when today's 3-3-2-1 is complete
    const plan = todayPlan();
    if (doneTotalOf(plan) >= targetTotalOf(plan) && targetTotalOf(plan) > 0 && rset.celebrated !== todayStr()) {
      rset.celebrated = todayStr(); saveSet(); celebrate('goal', '🎉 Today’s 定联 done! Great consistency.');
    }
  }

  /* ---------- the tab: Today and All prospects ---------- */
  let mode = 'today', query = '', filter = 'all', shown = 20, selecting = false;
  const selected = new Set();
  function render() {
    const view = $('#view-routine'); if (!view) return;
    view.innerHTML = `
      <div>
        <h1>定联</h1>
        <p class="lede">Talk first, open later. No sales intention: reply to a story, react to a post, or just chat.</p>
      </div>
      <div class="re-search"><input type="search" id="reQ" placeholder="🔍 Search name, remark or last chat" value="${esc(query)}" autocomplete="off"></div>
      <div class="re-tabs" role="tablist"><button type="button" data-mode="today" class="${mode === 'today' ? 'on' : ''}">Today</button><button type="button" data-mode="all" class="${mode === 'all' ? 'on' : ''}">All prospects (${prospects.length})</button></div>
      <div id="reBody" style="display:grid;gap:14px"></div>`;
    view.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { mode = b.dataset.mode; selecting = false; selected.clear(); shown = 20; render(); });
    const q = $('#reQ');
    q.oninput = () => { query = q.value; shown = 20; renderBody(); };
    renderBody();
    if (typeof updateRoutineCount === 'function') updateRoutineCount();
  }
  function renderBody() {
    const body = $('#reBody'); if (!body) return;
    renderBulkbar();
    if (typeof updateRoutineCount === 'function') updateRoutineCount();
    if (query.trim()) { body.innerHTML = searchHtml(); wireCommon(body); return; }
    body.innerHTML = mode === 'today' ? todayHtml() : allHtml();
    wireCommon(body);
    if (mode === 'today') wireToday(body); else wireAll(body);
  }
  function matches(p, q) {
    const last = (p.touches || []).slice(-1)[0];
    return (p.name + ' ' + (p.remark || '') + ' ' + (last ? last.note || '' : '')).toUpperCase().includes(q);
  }
  function searchHtml() {
    const q = query.trim().toUpperCase();
    const rows = prospects.filter(p => matches(p, q))
      .sort((a, b) => (b.name.toUpperCase().startsWith(q) - a.name.toUpperCase().startsWith(q)) || String(b.openedAt || '').localeCompare(String(a.openedAt || '')));
    if (!rows.length) return `<div class="empty">No one matches “${esc(query)}”. <br><button type="button" class="btn small" data-addname="${esc(query)}" style="margin-top:8px">+ Add “${esc(query)}” as a prospect</button></div>`;
    return `<p class="hint" style="margin:0">${rows.length} found</p>` + rows.slice(0, 30).map(p => pickCard({ p, d: due(p), g: p.group })).join('');
  }
  function ring(done, target) {
    const pct = target ? Math.min(1, done / target) : 0, r = 40, c = 2 * Math.PI * r;
    return `<svg class="ring" viewBox="0 0 100 100" role="img" aria-label="${done} of ${target} done">
      <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="10"/>
      <circle cx="50" cy="50" r="${r}" fill="none" stroke="${pct >= 1 ? 'var(--ok)' : 'var(--accent)'}" stroke-width="10" stroke-linecap="round"
        stroke-dasharray="${c * pct} ${c}" transform="rotate(-90 50 50)"/>
      <text x="50" y="50" text-anchor="middle" font-size="22" dy="2">${done}/${target}</text>
      <text x="50" y="68" text-anchor="middle" font-size="10" style="font-family:var(--body);fill:var(--muted)">today</text></svg>`;
  }
  function todayHtml() {
    const plan = todayPlan(), done = doneTotalOf(plan), target = targetTotalOf(plan);
    const dueAll = prospects.filter(p => due(p).days <= 0 && !touchedToday(p)).length;
    const st = streak(), wk = weekStats(0, true);
    const picks = ['D', 'C', 'B', 'A'].flatMap(g => plan[g].picks.map(x => Object.assign({ g }, x)));
    return `
      <div class="panel">
        <div class="re-hero">${ring(done, target)}
          <div style="display:grid;gap:8px">
            <b style="font-size:17px">${done >= target && target ? 'Done for today 🎉' : `${target - done} more to go`}</b>
            <span class="chip gold" style="justify-self:start">${st ? `🔥 ${st}-day streak` : 'Start your streak today'}</span>
            <span class="hint">${dueAll ? `${dueAll} due for a chat` : 'Nobody overdue'}</span>
          </div></div>
        <div class="progress-row">${['D', 'C', 'B', 'A'].map(g => `<div class="gprog ${plan[g].done >= plan[g].target ? 'met' : ''}"><span class="gbadge g${g}">${g}</span><br><b>${plan[g].done}/${plan[g].target}</b></div>`).join('')}</div>
      </div>
      <div style="display:grid;gap:10px">
        ${picks.length ? picks.map(pickCard).join('') : `<div class="empty">${prospects.length ? 'Today’s 定联 is done. See you tomorrow!' : 'Add your first prospects to start.'}</div>`}
      </div>
      <div class="row">
        <button class="btn primary grow" type="button" id="reAdd">+ Add prospects</button>
        <label class="btn" for="reShot">📷 Photo / screenshot</label>
        <input type="file" id="reShot" accept="image/*" multiple hidden>
      </div>
      <div id="reShotStatus" style="display:grid;gap:8px"></div>
      <div class="panel">
        <h2>This week</h2>
        <div class="stat-grid">
          <div class="stat"><b>${wk.touches}</b><span>定联 chats</span></div>
          <div class="stat"><b>${wk.activeDays}/7</b><span>Active days</span></div>
          <div class="stat"><b>${wk.opens}</b><span>Opened</span></div>
          <div class="stat"><b>${wk.presents}</b><span>Presented</span></div>
          <div class="stat"><b>${wk.closes}</b><span>Closed (NOC ${wk.noc})</span></div>
          <div class="stat"><b>RM ${Math.round(wk.anp).toLocaleString('en-MY')}</b><span>ANP</span></div>
        </div>
        <div class="badges">${badges(wk).map(([got, label]) => `<span class="badge ${got ? 'got' : ''}">${got ? '🏅' : '○'} ${label}</span>`).join('')}</div>
        ${team && !settings.name ? '<div class="notice warn">Add your name in <b>Me</b> so your team leader and the ranking show your name.</div>' : ''}
        ${team ? '<div id="reRank"><button type="button" class="btn small" id="reRankBtn">🏆 Team ranking by chats</button></div><p class="hint" style="margin:0">Your numbers (not prospect names) are shared with your team leader.</p>' : ''}
      </div>
      <div class="panel" id="rePush"></div>
      ${team && team.owner ? '<div class="panel"><h2>Team 定联 (numbers only)</h2><button type="button" class="btn small" id="reTeamBtn">Show team this week</button><div id="reTeamOut" style="overflow-x:auto"></div></div>' : ''}`;
  }
  function badges(wk) {
    const ups = prospects.reduce((n, p) => n + (p.groupHistory || []).filter(h => h.date >= wk.week && GROUPS.indexOf(h.to) < GROUPS.indexOf(h.from)).length, 0);
    return [[wk.activeDays >= 5, '5 active days'], [wk.touches >= 30, '30 chats'], [ups >= 3, '3 upgrades'], [wk.opens + wk.presents >= 3, '3 opens/presents'], [wk.closes >= 1, 'A close this week']];
  }
  function pickCard({ p, d, early }) {
    const last = p.lastTouch ? `Last chat ${Math.round((today0() - fromStr(p.lastTouch)) / 864e5)} days ago` : 'Never contacted';
    const lastNote = (p.touches || []).slice(-1)[0];
    const status = touchedToday(p) ? '✓ Talked today' : early ? 'Ahead of schedule' : d.days < 0 ? `${-d.days} day${d.days === -1 ? '' : 's'} overdue` : d.days === 0 ? 'Due today' : `Due in ${d.days} days`;
    return `<div class="pick" data-id="${p.id}">
      <div class="head"><span class="gbadge g${p.group}">${p.group}</span><b>${esc(p.name)}</b>
        <button type="button" class="starbtn ${p.star ? 'on' : ''}" data-star="${p.id}" aria-label="Favourite">${p.star ? '★' : '☆'}</button></div>
      <div class="meta">${status} · ${last}${lastNote && lastNote.note ? ` · “${esc(lastNote.note)}”` : ''}</div>
      <div class="idea">💬 ${esc(chatIdea(p))}</div>
      <div class="row"><button type="button" class="btn small primary grow" data-talk="${p.id}">✓ Talked</button><button type="button" class="btn small" data-open="${p.id}">Details</button></div>
      <div data-log="${p.id}" hidden></div>
    </div>`;
  }
  const FILTERS = [['all', 'All'], ['due', 'Due'], ['star', '⭐'], ['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D'], ['week', 'Talked this week']];
  function filtered() {
    const wk = weekStats(0).week;
    return prospects.filter(p => filter === 'all' || (filter === 'due' && due(p).days <= 0) || (filter === 'star' && p.star) || p.group === filter ||
      (filter === 'week' && (p.touches || []).some(t => t.date >= wk)))
      .map(p => ({ p, d: due(p) })).sort((a, b) => (b.p.star - a.p.star) || (a.d.days - b.d.days));
  }
  function allHtml() {
    const counts = Object.fromEntries(GROUPS.map(g => [g, prospects.filter(p => p.group === g).length]));
    const rows = filtered();
    return `
      <div class="progress-row">${GROUPS.map(g => `<button type="button" class="gprog" data-f="${g}" style="cursor:pointer;${filter === g ? 'border-color:var(--accent)' : ''}"><span class="gbadge g${g}">${g}</span><br><b>${counts[g]}</b></button>`).join('')}</div>
      <div class="chipset">${FILTERS.map(([k, l]) => `<button type="button" data-f="${k}" class="${filter === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="row" style="justify-content:space-between">
        <span class="hint">${rows.length} prospect${rows.length === 1 ? '' : 's'}${selecting ? ` · ${selected.size} selected` : ''}</span>
        <div class="row">${selecting ? `<button type="button" class="btn small" id="reSelAll">Select all ${rows.length}</button><button type="button" class="btn small ghost" id="reSelDone">Done</button>` : '<button type="button" class="btn small" id="reSel">☑ Select many</button>'}</div>
      </div>
      <div class="panel" style="padding:4px 12px">${rows.length ? rows.slice(0, shown).map(({ p, d }) => `<div class="plist-row">
          ${selecting ? `<input type="checkbox" data-pick="${p.id}" ${selected.has(p.id) ? 'checked' : ''} aria-label="Select ${esc(p.name)}">` : '<span></span>'}
          <span class="gbadge g${p.group}">${p.group}</span>
          <span class="n" data-open="${p.id}" role="button" tabindex="0">${p.star ? '⭐ ' : ''}${esc(p.name)}${p.sample ? ' <span class="tag-sample">Example</span>' : ''}<br><span class="s">${esc(p.remark || (p.lastTouch ? `Last chat ${p.lastTouch}` : 'Never contacted'))}</span></span>
          ${selecting ? `<span class="s">${d.days <= 0 ? 'Due' : `${d.days}d`}</span>` : `<button type="button" class="btn small" data-talk1="${p.id}">${touchedToday(p) ? '✓ Today' : '✓ Talked'}</button>`}
        </div>`).join('') : '<p class="hint">No prospects here yet.</p>'}</div>
      ${rows.length > shown ? `<button type="button" class="btn" id="reMore">Show 20 more (${rows.length - shown} left)</button>` : ''}
      ${prospects.some(p => p.sample) ? '<button type="button" class="btn small ghost" id="reClearSamples">Remove the example prospects</button>' : ''}`;
  }
  function wireCommon(root) {
    root.querySelectorAll('[data-star]').forEach(b => b.onclick = e => { e.stopPropagation(); const p = byId(b.dataset.star); p.star = !p.star; save(); renderBody(); });
    root.querySelectorAll('[data-talk]').forEach(b => b.onclick = () => openInlineLog(b.dataset.talk));
    root.querySelectorAll('[data-open]').forEach(b => { b.onclick = () => openProspect(b.dataset.open); b.onkeydown = e => { if (e.key === 'Enter') openProspect(b.dataset.open); }; });
    root.querySelectorAll('[data-addname]').forEach(b => b.onclick = () => openAdd(b.dataset.addname));
  }
  function wireToday(root) {
    $('#reAdd').onclick = () => openAdd('');
    $('#reShot').onchange = readShots;
    if ($('#reRankBtn')) $('#reRankBtn').onclick = showRank;
    if ($('#reTeamBtn')) $('#reTeamBtn').onclick = showTeam;
    renderPush();
  }
  function wireAll(root) {
    root.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filter = filter === b.dataset.f && GROUPS.includes(b.dataset.f) ? 'all' : b.dataset.f; shown = 20; renderBody(); });
    root.querySelectorAll('[data-talk1]').forEach(b => b.onclick = () => openLogSheet([b.dataset.talk1]));
    root.querySelectorAll('[data-pick]').forEach(c => c.onchange = () => { c.checked ? selected.add(c.dataset.pick) : selected.delete(c.dataset.pick); renderBulkbar(); root.querySelector('.hint').textContent = `${filtered().length} prospects · ${selected.size} selected`; });
    if ($('#reSel')) $('#reSel').onclick = () => { selecting = true; selected.clear(); renderBody(); };
    if ($('#reSelDone')) $('#reSelDone').onclick = () => { selecting = false; selected.clear(); renderBody(); };
    if ($('#reSelAll')) $('#reSelAll').onclick = () => { filtered().forEach(({ p }) => selected.add(p.id)); renderBody(); };
    if ($('#reMore')) $('#reMore').onclick = () => { shown += 20; renderBody(); };
    if ($('#reClearSamples')) $('#reClearSamples').onclick = async () => {
      if (!(await ask('Remove the example prospects?', 'The made-up examples will be deleted. Your own prospects stay.', 'Remove', true))) return;
      prospects = prospects.filter(p => !p.sample); save(); render();
    };
  }
  const byId = id => prospects.find(p => p.id === id);

  /* ---------- select many: one action for all of them ---------- */
  function renderBulkbar() {
    let bar = $('#reBulk');
    if (!(mode === 'all' && selecting && selected.size && !$('#view-routine').hidden)) { if (bar) bar.remove(); return; }
    if (!bar) { bar = document.createElement('div'); bar.id = 'reBulk'; bar.className = 'bulkbar'; document.body.appendChild(bar); }
    bar.innerHTML = `<b>${selected.size} selected</b><button type="button" data-b="talk">✓ Talked</button><button type="button" data-b="group">Group</button><button type="button" data-b="star">⭐</button><button type="button" data-b="del">🗑</button>`;
    bar.querySelector('[data-b=talk]').onclick = () => openLogSheet([...selected]);
    bar.querySelector('[data-b=group]').onclick = bulkGroup;
    bar.querySelector('[data-b=star]').onclick = () => { const list = [...selected].map(byId).filter(Boolean), on = !list.every(p => p.star); list.forEach(p => { p.star = on; }); save(); toast(on ? `⭐ ${list.length} marked favourite` : `${list.length} unmarked`); renderBody(); };
    bar.querySelector('[data-b=del]').onclick = async () => {
      const list = [...selected].map(byId).filter(Boolean);
      if (!(await ask(`Delete ${list.length} prospect${list.length === 1 ? '' : 's'}?`, `${list.slice(0, 5).map(p => esc(p.name)).join(', ')}${list.length > 5 ? '…' : ''}<br>Their chats and results will be removed from this phone. This can’t be undone.`, 'Delete', true))) return;
      prospects = prospects.filter(p => !selected.has(p.id)); selected.clear(); save(); render();
    };
  }
  function bulkGroup() {
    const list = [...selected].map(byId).filter(Boolean);
    const back = sheet(`<h2>Move ${list.length} to group</h2>
      <div class="seg-g">${GROUPS.map(g => `<button type="button" data-g="${g}">${g}</button>`).join('')}</div>
      <div class="hint">A: ${GROUP_INFO.A} · B: ${GROUP_INFO.B} · C: ${GROUP_INFO.C} · D: ${GROUP_INFO.D}</div>
      <button type="button" class="btn ghost" data-x>Cancel</button>`);
    back.querySelector('[data-x]').onclick = () => back.remove();
    back.querySelectorAll('[data-g]').forEach(b => b.onclick = () => {
      const g = b.dataset.g; let ups = 0;
      list.forEach(p => { if (p.group !== g) { if (GROUPS.indexOf(g) < GROUPS.indexOf(p.group)) ups++; p.groupHistory = (p.groupHistory || []).concat({ date: todayStr(), from: p.group, to: g }); p.group = g; } });
      save(); back.remove(); selected.clear(); selecting = false; renderBody();
      if (g === 'A' && ups) celebrate('up', `🚀 ${ups} moved up to A!`); else toast(`Moved ${list.length} to group ${g}.`);
    });
  }

  /* ---------- logging a chat: inline on a card, or a sheet for one or many ---------- */
  function logFormHtml(plat) {
    return `<div class="chipset" data-plats>${PLATFORMS.map(([k, l]) => `<button type="button" data-plat="${k}" class="${k === plat ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="chipset" data-quick>${QUICK_NOTES.map(n => `<button type="button" data-q="${esc(n)}">${esc(n)}</button>`).join('')}</div>
      <input type="text" maxlength="120" placeholder="What did you talk about? (optional)" data-note>
      <label class="mini-label">When<input type="date" data-date value="${todayStr()}" max="${todayStr()}"></label>`;
  }
  function wireLogForm(root, onPlat) {
    root.querySelectorAll('[data-plat]').forEach(b => b.onclick = () => { onPlat(b.dataset.plat); root.querySelectorAll('[data-plat]').forEach(x => x.classList.toggle('on', x === b)); });
    root.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { root.querySelector('[data-note]').value = b.dataset.q; root.querySelectorAll('[data-q]').forEach(x => x.classList.toggle('on', x === b)); });
  }
  function openInlineLog(id) {
    const p = byId(id), box = document.querySelector(`[data-log="${id}"]`); if (!p || !box) return;
    let plat = p.platform || 'whatsapp';
    box.hidden = false;
    box.innerHTML = `<div style="display:grid;gap:8px">${logFormHtml(plat)}
      <div class="row"><button type="button" class="btn small primary grow" data-save>Save chat</button><button type="button" class="btn small ghost" data-cancel>Cancel</button></div><div data-err></div></div>`;
    wireLogForm(box, v => { plat = v; });
    box.querySelector('[data-cancel]').onclick = () => { box.hidden = true; box.innerHTML = ''; };
    box.querySelector('[data-save]').onclick = () => {
      const date = box.querySelector('[data-date]').value;
      if (!validDay(date)) { box.querySelector('[data-err]').innerHTML = '<div class="notice bad">Pick a date that isn’t in the future.</div>'; return; }
      addTouch(p, plat, box.querySelector('[data-note]').value.trim(), date); save();
      toast(`Logged. Next chat with ${p.name} in ${rset.gaps[p.group]} days.`); renderBody(); checkGoal();
    };
  }
  function openLogSheet(ids) {
    const list = ids.map(byId).filter(Boolean); if (!list.length) return;
    let plat = list.length === 1 ? list[0].platform || 'whatsapp' : 'instagram';
    const back = sheet(`<h2>${list.length === 1 ? `Log a chat with ${esc(list[0].name)}` : `Log the same chat for ${list.length} prospects`}</h2>
      ${list.length > 1 ? `<p class="hint" style="margin:0">${list.slice(0, 6).map(p => esc(p.name)).join(', ')}${list.length > 6 ? ` and ${list.length - 6} more` : ''}</p>` : ''}
      ${logFormHtml(plat)}<div data-err></div>
      <div class="row"><button type="button" class="btn primary grow" data-save>Save</button><button type="button" class="btn ghost" data-x>Cancel</button></div>`);
    wireLogForm(back, v => { plat = v; });
    back.querySelector('[data-x]').onclick = () => back.remove();
    back.querySelector('[data-save]').onclick = () => {
      const date = back.querySelector('[data-date]').value, note = back.querySelector('[data-note]').value.trim();
      if (!validDay(date)) { back.querySelector('[data-err]').innerHTML = '<div class="notice bad">Pick a date that isn’t in the future.</div>'; return; }
      list.forEach(p => addTouch(p, plat, note, date)); save(); back.remove();
      selected.clear(); selecting = false;
      toast(list.length === 1 ? `Logged. Next chat with ${list[0].name} in ${rset.gaps[list[0].group]} days.` : `Logged ${list.length} chats.`);
      render(); checkGoal();
    };
  }
  function addTouch(p, platform, note, date) {
    p.touches = (p.touches || []).concat({ id: uid(), date: date || todayStr(), platform, note });
    fixLast(p);
  }

  /* ---------- prospect details: group, favourite, remark, results, and editable history ---------- */
  function sheet(html) {
    const back = document.createElement('div'); back.className = 'sheet-back';
    back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
    back.onclick = e => { if (e.target === back) back.remove(); };
    document.body.appendChild(back); return back;
  }
  function historyRows(p) {
    return [...(p.results || []).map(r => ({ kind: 'result', id: r.id, date: r.date, text: r.stage === 'close' ? `✅ Closed: ANP RM ${Number(r.anp).toLocaleString('en-MY')}, NOC ${r.noc}` : r.stage === 'present' ? '📊 Presented' : '🔓 Opened' })),
      ...(p.touches || []).map(t => ({ kind: 'touch', id: t.id, date: t.date, text: `💬 ${platName(t.platform)}${t.note ? `: ${t.note}` : ''}` })),
      ...(p.groupHistory || []).map(h => ({ kind: 'group', date: h.date, text: `↕ Moved ${h.from} → ${h.to}` }))]
      .sort((a, b) => b.date.localeCompare(a.date));
  }
  function openProspect(id) {
    const p = byId(id); if (!p) return;
    p.openedAt = new Date().toISOString(); store.set(KEY_P, prospects);
    const d = due(p);
    const back = sheet(`
      <div class="row" style="justify-content:space-between"><h2 style="overflow-wrap:anywhere">${esc(p.name)}</h2><button type="button" class="btn small ghost" data-x>Close</button></div>
      <div class="hint">${p.lastTouch ? `Last chat ${p.lastTouch}` : 'Never contacted'} · ${d.days <= 0 ? 'Due now' : `next chat in ${d.days} days`}</div>
      <button type="button" class="btn primary" data-logone>✓ Log a chat (any time, even before it’s due)</button>
      <div class="mini-label">Group (you decide: upgrade when you get closer)</div>
      <div class="seg-g">${GROUPS.map(g => `<button type="button" data-g="${g}" class="${p.group === g ? 'on g' + g : ''}">${g}</button>`).join('')}</div>
      <div class="hint" data-ginfo>${esc(GROUP_INFO[p.group])} · chat every ${rset.gaps[p.group]} days</div>
      <label class="check"><input type="checkbox" data-starbox ${p.star ? 'checked' : ''}> ⭐ Favourite: always shown first</label>
      <label class="field">Name<input type="text" data-name maxlength="60" value="${esc(p.name)}"></label>
      <label class="field">Remark to remind yourself
        <textarea data-remark maxlength="200" style="min-height:70px" placeholder="e.g. Getting married in March. Ask about wedding prep.">${esc(p.remark || '')}</textarea></label>
      <div class="mini-label">Record a result</div>
      <div class="row">${STAGES.map(([k, l]) => `<button type="button" class="btn small ${k === 'close' ? 'primary' : ''}" data-res="${k}">${stageWord(k)}</button>`).join('')}</div>
      <div data-resform hidden></div>
      <div class="mini-label">History (tap Edit to fix a mistake)</div>
      <div class="hist" data-hist></div>
      <div class="row"><button type="button" class="btn primary grow" data-savep>Save</button><button type="button" class="btn small danger" data-del>Delete prospect</button></div>`);
    let group = p.group;
    const q = s => back.querySelector(s);
    const drawHist = () => {
      const rows = historyRows(p);
      q('[data-hist]').innerHTML = rows.length ? rows.slice(0, 40).map(r => `<div class="hist-row"><span><b>${esc(r.date)}</b> ${esc(r.text)}</span>${r.id ? `<button type="button" data-edit="${r.kind}:${r.id}">Edit</button>` : '<span></span>'}</div>`).join('') : '<div class="hint">No chats yet.</div>';
      q('[data-hist]').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { const [kind, rid] = b.dataset.edit.split(':'); editRecord(p, kind, rid, () => { drawHist(); render(); }); });
    };
    drawHist();
    back.querySelectorAll('[data-g]').forEach(b => b.onclick = () => {
      group = b.dataset.g;
      back.querySelectorAll('[data-g]').forEach(x => x.className = x.dataset.g === group ? 'on g' + group : '');
      q('[data-ginfo]').textContent = `${GROUP_INFO[group]} · chat every ${rset.gaps[group]} days`;
    });
    q('[data-x]').onclick = () => back.remove();
    q('[data-logone]').onclick = () => { back.remove(); openLogSheet([p.id]); };
    back.querySelectorAll('[data-res]').forEach(b => b.onclick = () => resultForm(p, b.dataset.res, q('[data-resform]'), null, () => { drawHist(); render(); }));
    q('[data-savep]').onclick = () => {
      const name = q('[data-name]').value.replace(/\s+/g, ' ').trim();
      if (!name) { toast('The name can’t be empty.'); return; }
      if (group !== p.group) p.groupHistory = (p.groupHistory || []).concat({ date: todayStr(), from: p.group, to: group });
      const up = GROUPS.indexOf(group) < GROUPS.indexOf(p.group);
      p.group = group; p.star = q('[data-starbox]').checked; p.remark = q('[data-remark]').value.trim(); p.name = name;
      save(); back.remove(); render();
      if (up && group === 'A') celebrate('up', `🚀 ${p.name} is now Type A!`); else toast(up ? `${p.name} upgraded to ${group}!` : 'Saved');
    };
    q('[data-del]').onclick = async () => {
      if (!(await ask(`Delete ${esc(p.name)}?`, 'Their chats and results will be removed from this phone. This can’t be undone.', 'Delete', true))) return;
      prospects = prospects.filter(x => x.id !== p.id); save(); back.remove(); render();
    };
  }
  // add a result (rec = null) or edit one; closes need ANP in RM and NOC
  function resultForm(p, stage, box, rec, done) {
    box.hidden = false;
    const isClose = stage === 'close';
    box.innerHTML = `<div style="display:grid;gap:8px;border:1px solid var(--line);border-radius:12px;padding:10px">
      ${rec ? `<div class="chipset">${STAGES.map(([k, l]) => `<button type="button" data-st="${k}" class="${k === stage ? 'on' : ''}">${l}</button>`).join('')}</div>` : `<b>${STAGES.find(s => s[0] === stage)[1]}</b>`}
      <div class="two">
        <label class="mini-label">Date<input type="date" data-rdate value="${rec ? rec.date : todayStr()}" max="${todayStr()}"></label>
        ${isClose ? `<label class="mini-label">NOC (cases)<input type="number" inputmode="numeric" min="1" step="1" value="${rec ? rec.noc : 1}" data-noc></label>` : ''}
      </div>
      ${isClose ? `<label class="mini-label">ANP (RM)<input type="number" inputmode="decimal" min="0" step="0.01" data-anp value="${rec ? rec.anp : ''}" placeholder="e.g. 2400"></label>` : ''}
      <div data-rerr></div>
      <div class="row"><button type="button" class="btn small primary grow" data-rsave>${rec ? 'Save changes' : 'Record'}</button>
        ${rec ? '<button type="button" class="btn small danger" data-rdel>Delete</button>' : ''}<button type="button" class="btn small ghost" data-rcancel>Cancel</button></div></div>`;
    const q = s => box.querySelector(s), err = m => { q('[data-rerr]').innerHTML = `<div class="notice bad">${esc(m)}</div>`; };
    box.querySelectorAll('[data-st]').forEach(b => b.onclick = () => resultForm(p, b.dataset.st, box, Object.assign({}, rec, { stage: b.dataset.st, noc: rec.noc || 1 }), done));
    q('[data-rcancel]').onclick = () => { box.hidden = true; box.innerHTML = ''; };
    q('[data-rsave]').onclick = async () => {
      const date = q('[data-rdate]').value;
      if (!validDay(date)) return err('Pick a date that isn’t in the future.');
      const out = { id: rec ? rec.id : uid(), date, stage };
      if (isClose) {
        out.anp = Number(q('[data-anp]').value); out.noc = Number(q('[data-noc]').value);
        if (!(out.anp > 0)) return err('Enter the ANP in RM (more than 0).');
        if (!Number.isInteger(out.noc) || out.noc < 1) return err('NOC must be a whole number of cases, 1 or more.');
      }
      const label = STAGES.find(s => s[0] === stage)[1];
      if (!(await ask(rec ? 'Save this change?' : `Record ${stageWord(stage)}?`, `${esc(p.name)}: ${esc(label)} on ${esc(date)}${isClose ? `, ANP RM ${out.anp.toLocaleString('en-MY')}, NOC ${out.noc}` : ''}.`, rec ? 'Save' : 'Record'))) return;
      p.results = (p.results || []).filter(r => r.id !== out.id).concat(out); save(); box.hidden = true; box.innerHTML = '';
      done();
      if (!rec && isClose) celebrate('close', '💰 Close recorded. Well done!');
      else toast(rec ? 'Changed' : 'Recorded');
    };
    if (q('[data-rdel]')) q('[data-rdel]').onclick = async () => {
      if (!(await ask('Delete this result?', `${esc(p.name)}: ${esc(STAGES.find(s => s[0] === rec.stage)[1])} on ${esc(rec.date)} will be removed. This can’t be undone.`, 'Delete', true))) return;
      p.results = (p.results || []).filter(r => r.id !== rec.id); save(); box.hidden = true; box.innerHTML = ''; done(); toast('Deleted');
    };
  }
  function editRecord(p, kind, rid, done) {
    if (kind === 'result') {
      const rec = (p.results || []).find(r => r.id === rid); if (!rec) return;
      const back = sheet(`<h2>Edit result</h2><div data-box></div><button type="button" class="btn ghost" data-x>Close</button>`);
      back.querySelector('[data-x]').onclick = () => back.remove();
      resultForm(p, rec.stage, back.querySelector('[data-box]'), rec, () => { back.remove(); done(); });
      return;
    }
    const t = (p.touches || []).find(x => x.id === rid); if (!t) return;
    let plat = t.platform || 'whatsapp';
    const back = sheet(`<h2>Edit chat</h2>${logFormHtml(plat)}<div data-err></div>
      <div class="row"><button type="button" class="btn primary grow" data-save>Save changes</button><button type="button" class="btn small danger" data-del>Delete</button><button type="button" class="btn ghost" data-x>Cancel</button></div>`);
    back.querySelector('[data-note]').value = t.note || ''; back.querySelector('[data-date]').value = t.date;
    wireLogForm(back, v => { plat = v; });
    back.querySelector('[data-x]').onclick = () => back.remove();
    back.querySelector('[data-save]').onclick = () => {
      const date = back.querySelector('[data-date]').value;
      if (!validDay(date)) { back.querySelector('[data-err]').innerHTML = '<div class="notice bad">Pick a date that isn’t in the future.</div>'; return; }
      t.date = date; t.platform = plat; t.note = back.querySelector('[data-note]').value.trim(); fixLast(p); save(); back.remove(); done(); toast('Chat changed');
    };
    back.querySelector('[data-del]').onclick = async () => {
      if (!(await ask('Delete this chat?', `${esc(p.name)}: ${esc(platName(t.platform))} on ${esc(t.date)} will be removed. Their next due date is worked out again.`, 'Delete', true))) return;
      p.touches = p.touches.filter(x => x.id !== rid); fixLast(p); save(); back.remove(); done(); toast('Chat deleted');
    };
  }

  /* ---------- adding prospects: type, paste, or from a photo ---------- */
  function openAdd(prefill, platformGuess) {
    let group = 'D';
    const back = sheet(`
      <div class="row" style="justify-content:space-between"><h2>Add prospects</h2><button type="button" class="btn small ghost" data-x>Close</button></div>
      <label class="field">Names, one per line
        <textarea data-names style="min-height:160px" placeholder="Jason&#10;Aunty Lily&#10;Wei Ming">${esc(prefill)}</textarea>
        <small>Paste from anywhere, or check the names read from your photo. Remove lines you don’t want.</small></label>
      <div class="mini-label">Which group are they?</div>
      <div class="seg-g">${GROUPS.map(g => `<button type="button" data-g="${g}" class="${g === group ? 'on g' + g : ''}">${g}</button>`).join('')}</div>
      <div class="hint" data-ginfo>${esc(GROUP_INFO[group])}</div>
      <div data-adderr></div>
      <button type="button" class="btn primary" data-add>Add to my list</button>`);
    const q = s => back.querySelector(s);
    q('[data-x]').onclick = () => back.remove();
    back.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { group = b.dataset.g; back.querySelectorAll('[data-g]').forEach(x => x.className = x.dataset.g === group ? 'on g' + group : ''); q('[data-ginfo]').textContent = GROUP_INFO[group]; });
    q('[data-add]').onclick = async () => {
      const seen = new Set(prospects.map(p => key(p.name)));
      const lines = q('[data-names]').value.split(/\n/).map(s => s.replace(/^[\s\-*\d.)]+/, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
      const fresh = [], dup = [];
      lines.forEach(n => { const k = key(n); if (!k) return; if (seen.has(k)) dup.push(n); else { seen.add(k); fresh.push(n); } });
      if (!fresh.length) { q('[data-adderr]').innerHTML = `<div class="notice warn">${dup.length ? 'Everyone here is already in your list.' : 'Type or paste at least one name.'}</div>`; return; }
      if (fresh.length > 30 && !(await ask(`Add ${fresh.length} prospects?`, `They’ll all go into group ${group}. You can move people up later, many at once with Select many.`, 'Add them'))) return;
      fresh.forEach(name => prospects.push({ id: uid(), name: name.slice(0, 60), group, platform: platformGuess || '', star: false, remark: '', created: todayStr(), touches: [], results: [], groupHistory: [] }));
      save(); back.remove(); query = ''; render();
      toast(`Added ${fresh.length}${dup.length ? `, skipped ${dup.length} already in your list` : ''}.`);
    };
    q('[data-names]').focus();
  }
  const PROSPECT_RULES_OWN_KEY = `You read one screenshot or photo that lists people an insurance agent knows, for example a WhatsApp chat list, phone contacts, Instagram or Facebook followers/friends, a name card, or a handwritten name list.
Return JSON only: {"rows": [{"name": "", "platform": ""}], "note": ""}
- One entry per person you can read. Copy each name exactly as shown (nicknames and emojis are fine); do not translate, complete or guess.
- platform: "whatsapp", "instagram", "facebook", "contacts" or "other", judged from the app shown; "" if unclear.
- Skip group chats, channels, businesses, brand pages, the phone owner's own profile, and names that are cut off.
- Never output phone numbers, emails, addresses, message text or anything else about the person.
- note: one short sentence if the image has no people list or is unreadable; otherwise "".`;
  async function readShots(e) {
    const files = [...e.target.files]; e.target.value = ''; if (!files.length) return;
    const out = $('#reShotStatus');
    if (!aiReady()) { out.innerHTML = '<div class="notice warn">Reading photos needs team AI. Open the team link and sign in, or type the names instead.</div>'; return; }
    if (!(await ask('Read names from this photo?', `${files.length} image${files.length === 1 ? '' : 's'} will be sent to the AI. Only names are read, never phone numbers or messages. You check the list before anything is saved.`, 'Read names'))) return;
    const names = [], plats = [], msgs = [];
    for (let i = 0; i < files.length; i++) {
      out.innerHTML = `<div class="notice ok">Reading image ${i + 1} of ${files.length}…</div>`;
      try {
        const image = await downscale(files[i]);
        let j;
        if (team) { try { j = await callJson('api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image, kind: 'prospects' }) }, 'team', 120000); } finally { loadTeam(); } }
        else j = await callJson('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + settings.apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: settings.textModel, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: PROSPECT_RULES_OWN_KEY }, { role: 'user', content: [{ type: 'text', text: 'Read this list.' }, { type: 'image_url', image_url: { url: image, detail: 'high' } }] }] }) }, settings.textModel, 120000);
        const r = JSON.parse(j.choices[0].message.content);
        (r.rows || []).forEach(x => { const n = String(x.name || '').trim(); if (n) { names.push(n); if (x.platform) plats.push(x.platform); } });
        msgs.push(['ok', `Image ${i + 1}: ${(r.rows || []).length} name${(r.rows || []).length === 1 ? '' : 's'} found.${r.note ? ' ' + r.note : ''}`]);
      } catch (err) { msgs.push(['bad', `Image ${i + 1}: ${err.message || 'could not be read.'}`]); }
    }
    out.innerHTML = msgs.map(([k, m]) => `<div class="notice ${k}">${esc(m)}</div>`).join('');
    if (names.length) {
      const top = plats.sort((a, b) => plats.filter(x => x === b).length - plats.filter(x => x === a).length)[0];
      openAdd([...new Set(names)].join('\n'), ['whatsapp', 'instagram', 'facebook'].includes(top) ? top : '');
    }
  }

  /* ---------- weekly numbers, team ranking, and the leader's view ---------- */
  function weekStats(offset, withExamples = false) { // Monday-to-Sunday week, offset 0 = this week; examples never go to the team leader
    const t = today0(), mon = addDays(t, -((t.getDay() + 6) % 7) - 7 * offset), sun = addDays(mon, 6);
    const a = dayStr(mon), b = dayStr(sun), inW = d => d >= a && d <= b;
    const s = { week: a, touches: 0, byGroup: { A: 0, B: 0, C: 0, D: 0 }, opens: 0, presents: 0, closes: 0, noc: 0, anp: 0, activeDays: 0, prospects: { A: 0, B: 0, C: 0, D: 0 } };
    const days = new Set();
    prospects.filter(p => withExamples || !p.sample).forEach(p => {
      s.prospects[p.group]++;
      (p.touches || []).forEach(x => { if (inW(x.date)) { s.touches++; s.byGroup[p.group]++; days.add(x.date); } });
      (p.results || []).forEach(r => { if (!inW(r.date)) return; if (r.stage === 'open') s.opens++; else if (r.stage === 'present') s.presents++; else if (r.stage === 'close') { s.closes++; s.noc += r.noc || 0; s.anp += r.anp || 0; } });
    });
    s.activeDays = days.size; return s;
  }
  // what the reminder pop-ups need, as counts per date only (never names): when prospects fall due,
  // and how many customer birthdays / policy anniversaries fall on each day of the year
  function reminderCounts() {
    const dueBy = {}, plan = todayPlan();
    prospects.filter(p => !p.sample).forEach(p => {
      const d = due(p), day = d.days <= 0 ? todayStr() : dayStr(d.next);
      if (d.days <= 60) dueBy[day] = (dueBy[day] || 0) + 1;
    });
    const occ = {};
    (typeof customers !== 'undefined' ? customers : []).filter(c => !c.sample).forEach(c => {
      const nb = nextBirthday(c.dob), na = nextAnniversary(c.policyDate);
      if (nb) { const k = dayStr(nb.date).slice(5); occ[k] = occ[k] || { b: 0, a: 0 }; occ[k].b++; }
      if (na) { const k = dayStr(na.date).slice(5); occ[k] = occ[k] || { b: 0, a: 0 }; occ[k].a++; }
    });
    return { day: todayStr(), dueBy, occ, doneToday: doneTotalOf(plan), targetToday: targetTotalOf(plan) };
  }
  let dirty = false, timer = null;
  function markDirty() { dirty = true; if (!timer) timer = setTimeout(sync, 20000); }
  async function sync() {
    timer = null; if (!dirty || !team) return; dirty = false;
    try {
      await fetch('api/stats', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: settings.name || '', weeks: [weekStats(0), weekStats(1)], reminders: reminderCounts() }) });
    } catch { dirty = true; }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') sync(); else if (!$('#view-routine').hidden) render(); });
  async function showRank() {
    const box = $('#reRank'); box.innerHTML = '<p class="hint">Loading…</p>';
    dirty = true; await sync();
    try {
      const r = await callJson('api/team-rank', {}, 'team', 30000);
      box.innerHTML = `<p class="hint" style="margin:4px 0">🏆 Team ranking by 定联 chats this week (effort, not sales)</p>
        <div class="rank">${r.rows.slice(0, 10).map((x, i) => `<div class="${x.me ? 'me' : ''}"><span>${i + 1}</span><span style="overflow-wrap:anywhere">${esc(x.name)}${x.me ? ' (you)' : ''}</span><b>${x.touches}</b></div>`).join('') || '<p class="hint">No chats logged by the team yet this week.</p>'}
        ${r.myRank > 10 ? `<div class="me"><span>${r.myRank}</span><span>You</span><b>${r.rows[r.myRank - 1].touches}</b></div>` : ''}</div>`;
    } catch (e) { box.innerHTML = `<p class="hint">${esc(e.message)}</p>`; }
  }
  async function showTeam() {
    const out = $('#reTeamOut'); out.textContent = 'Loading…';
    try {
      const r = await callJson('api/team-stats', {}, 'team', 30000);
      const table = (wk, title) => `<p class="hint" style="margin:8px 0 4px">${title} (from ${wk.week})</p><table class="team-table"><tr><th>Agent</th><th>Chats</th><th>Days</th><th>Open</th><th>Present</th><th>Close</th><th>NOC</th><th>ANP</th></tr>
        ${wk.agents.map(a => `<tr><td style="overflow-wrap:anywhere">${a.name ? esc(a.name) : '<span style="color:var(--muted)">Name not set yet</span>'}</td><td>${a.touches}</td><td>${a.activeDays}</td><td>${a.opens}</td><td>${a.presents}</td><td>${a.closes}</td><td>${a.noc}</td><td>${Math.round(a.anp).toLocaleString('en-MY')}</td></tr>`).join('') || '<tr><td colspan="8">No numbers yet.</td></tr>'}</table>`;
      out.innerHTML = table(r.thisWeek, 'This week') + table(r.lastWeek, 'Last week');
    } catch (e) { out.textContent = e.message; }
  }

  /* ---------- lock-screen pop-ups (Firebase, same project as the team calendar) ---------- */
  const FIREBASE = { apiKey: 'AIzaSyAgImD0Ymcz2xxJqxrLAY4pWKPq5LU_s80', authDomain: 'redefine-calendar.firebaseapp.com', projectId: 'redefine-calendar',
    storageBucket: 'redefine-calendar.firebasestorage.app', messagingSenderId: '6378826198', appId: '1:6378826198:web:6eb6e904b430037d715c77' };
  const VAPID = 'BDXnbHzWr_2YQdgruNn_zrQCejdefoXDHC3dSL0r52uT32tdxk3zryUrm96NIo1vGbPhVEJjRJfcTMRK7J7PsCM';
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); });
  let fb = null;
  async function messaging() {
    if (!fb) fb = loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js')
      .then(() => loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js'))
      .then(() => { if (!firebase.apps.length) firebase.initializeApp(FIREBASE); return firebase.messaging(); });
    return fb;
  }
  const pushOn = () => !!(store.get('remembered.pushToken', '') && 'Notification' in window && Notification.permission === 'granted');
  function renderPush() {
    const box = $('#rePush'); if (!box) return;
    const hours = Array.from({ length: 15 }, (_, i) => i + 7);
    const can = 'Notification' in window && 'serviceWorker' in navigator;
    box.innerHTML = `<h2>Reminders</h2>
      ${!team ? '<p class="hint" style="margin:0">Pop-ups work on the team link after you sign in.</p>'
        : !can ? `<p class="hint" style="margin:0">${isIOS && !standalone ? 'On iPhone, first add this app to your Home Screen (Share → Add to Home Screen), open it from there, then turn on pop-ups.' : 'This browser can’t show pop-ups. Try Chrome on Android, or the Home Screen app on iPhone.'}</p>`
        : `<p class="hint" style="margin:0">${pushOn() ? '🔔 Pop-ups are on for this phone.' : 'Get a pop-up on your lock screen, like WhatsApp, even when the app is closed.'}</p>
      <label class="field">Daily 定联 reminder at
        <select id="rePushHour">${hours.map(h => `<option value="${h}" ${h === rset.pushHour ? 'selected' : ''}>${h <= 12 ? h : h - 12}${h < 12 ? 'am' : 'pm'}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" id="reNudge" ${rset.nudge9pm ? 'checked' : ''}> 9pm nudge if today’s 3-3-2-1 isn’t done</label>
      <div class="row">${pushOn() ? '<button type="button" class="btn small" id="rePushSave">Save times</button><button type="button" class="btn small" id="rePushTest">Test in 15 s (lock your phone)</button><button type="button" class="btn small ghost" id="rePushOff">Turn off</button>'
        : '<button type="button" class="btn primary" id="rePushOn">🔔 Turn on pop-ups</button>'}</div>
      <p class="hint" style="margin:0">You get one pop-up for prospects due, and a separate 🎂 pop-up for customer birthdays and policy anniversaries (today, plus tomorrow as a heads-up). Names never leave your phone.</p>`}
      <button type="button" class="btn small ghost" id="reCal">📅 Or add a daily calendar reminder instead</button>`;
    const hourSel = $('#rePushHour'), nudge = $('#reNudge');
    const prefs = () => { rset.pushHour = Number(hourSel.value); rset.nudge9pm = nudge.checked; saveSet(); return { hour: rset.pushHour, nudge: rset.nudge9pm }; };
    if ($('#rePushOn')) $('#rePushOn').onclick = () => enablePush(prefs());
    if ($('#rePushSave')) $('#rePushSave').onclick = async () => { try { await callJson('api/push-reg', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ token: store.get('remembered.pushToken', '') }, prefs())) }, 'team', 20000); toast('Reminder times saved'); } catch (e) { toast(e.message); } };
    if ($('#rePushTest')) $('#rePushTest').onclick = async () => { dirty = true; await sync(); try { await callJson('api/push-test', { method: 'POST' }, 'team', 30000); toast('Test pop-up coming in about 15 seconds. Lock your phone now.'); } catch (e) { toast(e.message); } };
    if ($('#rePushOff')) $('#rePushOff').onclick = async () => {
      if (!(await ask('Turn off pop-ups on this phone?', 'You can turn them on again any time.', 'Turn off'))) return;
      try { await callJson('api/push-off', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: store.get('remembered.pushToken', '') }) }, 'team', 20000); } catch {}
      store.set('remembered.pushToken', ''); renderPush();
    };
    $('#reCal').onclick = dailyReminder;
  }
  async function enablePush(prefs) {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { toast('Pop-ups were not allowed. Allow notifications for this app in your phone settings, then try again.'); return; }
      const reg = await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready;
      const m = await messaging();
      const token = await m.getToken({ vapidKey: VAPID, serviceWorkerRegistration: reg });
      if (!token) throw new Error('The phone gave no pop-up address. Try again.');
      dirty = true; await sync();
      await callJson('api/push-reg', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ token }, prefs)) }, 'team', 20000);
      store.set('remembered.pushToken', token); renderPush(); toast('🔔 Pop-ups are on for this phone');
    } catch (e) { toast(`Couldn’t turn on pop-ups: ${e.message || e}`); }
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('message', e => { const m = e.data && e.data.rePush; if (m) toast(`🔔 ${m.title}: ${m.body}`); });
  }
  async function dailyReminder() {
    if (!(await ask('Add a daily 定联 reminder?', 'Your phone calendar will remind you every day at 9pm to do your 3-3-2-1 定联. You can delete it from your calendar anytime.', 'Download reminder'))) return;
    const t = today0(), start = `${dayStr(t).replace(/-/g, '')}T210000`, end = `${dayStr(t).replace(/-/g, '')}T211500`, url = location.origin + location.pathname;
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//REDEFINE//Routine Engagement//EN', 'BEGIN:VEVENT', 'UID:dinglian-daily@customer-relationship-app',
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, `DTSTART:${start}`, `DTEND:${end}`, 'RRULE:FREQ=DAILY', 'SUMMARY:定联 time: 3 D\\, 3 C\\, 2 B\\, 1 A',
      `DESCRIPTION:Open the app and see who to talk to today: ${url}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT0M', 'DESCRIPTION:定联 time', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n') + '\r\n';
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'dinglian-daily-reminder.ics';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Open the file and tap Add to put it in your calendar.');
  }

  window.renderRoutine = render;
  window.routineDueCount = () => prospects.filter(p => due(p).days <= 0 && !touchedToday(p)).length;
  window.routineLeave = () => { const bar = $('#reBulk'); if (bar) bar.remove(); };
  window.routineMarkDirty = () => markDirty(); // customer birthdays/anniversaries feed the pop-up counts too
  if (location.hash === '#routine') setTimeout(() => typeof show === 'function' && show('routine'), 0); // pop-ups open straight here
  setTimeout(markDirty, 8000); // team sign-in loads after this file, so the first sync waits a moment
})();
