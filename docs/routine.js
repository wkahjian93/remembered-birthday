// Routine Engagement (定联): ABCD prospects, who to talk to today, one-tap logging, and open/present/close results.
// Uses the main app's helpers ($, esc, ask, toast, store, uid, today0, MONTHS, team, callJson, loadTeam, aiReady, settings, downscale).
'use strict';
(() => {
  const KEY_P = 'remembered.prospects.v1', KEY_R = 'remembered.routine.v1';
  const GROUPS = ['A', 'B', 'C', 'D'];
  const GROUP_INFO = { A: '挺你到底的好朋友', B: '好友，聊私人心事', C: '三分熟，很久不见', D: '认识，有联络方式' };
  const PLATFORMS = [['whatsapp', 'WhatsApp'], ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['call', 'Call'], ['meet', 'Met up'], ['other', 'Other']];
  const DEFAULTS = { gaps: { A: 7, B: 21, C: 42, D: 56 }, target: { A: 1, B: 2, C: 3, D: 3 } };
  const rset = Object.assign({}, DEFAULTS, store.get(KEY_R, {}));
  const dayStr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fromStr = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const todayStr = () => dayStr(today0());
  const key = s => String(s || '').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');

  let prospects = store.get(KEY_P, null);
  if (!Array.isArray(prospects)) { // made-up examples so the first screen shows how it works
    const t = today0(), ago = n => dayStr(addDays(t, -n));
    prospects = [
      { name: 'Jason (ex-colleague)', group: 'D', platform: 'whatsapp', star: false, remark: 'Just changed job to Shopee', created: ago(70), lastTouch: ago(60), touches: [{ date: ago(60), platform: 'whatsapp', note: 'Congrats on new job' }] },
      { name: 'Aunty Lily', group: 'C', platform: 'facebook', star: false, remark: '', created: ago(50), lastTouch: ago(45), touches: [{ date: ago(45), platform: 'facebook', note: 'Reacted to her cooking post' }] },
      { name: 'Wei Ming', group: 'B', platform: 'instagram', star: true, remark: 'Getting married in March. Ask about wedding prep.', created: ago(40), lastTouch: ago(22), touches: [{ date: ago(22), platform: 'instagram', note: 'Replied story, honeymoon in Japan' }] },
      { name: 'Sarah Tan', group: 'A', platform: 'whatsapp', star: true, remark: 'Asked about medical card for her mum', created: ago(30), lastTouch: ago(8), touches: [{ date: ago(8), platform: 'meet', note: 'Coffee, talked about her mum’s health' }], results: [{ date: ago(8), stage: 'open' }] },
      { name: 'Hafiz', group: 'D', platform: 'instagram', star: false, remark: '', created: ago(3), touches: [] }
    ].map(p => Object.assign({ id: uid(), sample: true, results: [], groupHistory: [] }, p));
    store.set(KEY_P, prospects);
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
      const inG = prospects.filter(p => p.group === g && !p.paused);
      const done = inG.filter(touchedToday);
      const left = inG.filter(p => !touchedToday(p)).map(p => ({ p, d: due(p) }))
        .sort((a, b) => (b.p.star - a.p.star) || (a.d.days - b.d.days));
      const need = Math.max(0, (rset.target[g] || 0) - done.length);
      const dueNow = left.filter(x => x.d.days <= 0);
      const picks = dueNow.slice(0, need);
      if (picks.length < need) picks.push(...left.filter(x => x.d.days > 0).slice(0, need - picks.length).map(x => Object.assign({ early: true }, x)));
      plan[g] = { done: done.length, target: rset.target[g] || 0, picks, dueCount: dueNow.length, total: inG.length };
    });
    return plan;
  }
  function streak() { // days in a row with at least one 定联 (today counts once you've done one)
    let n = 0, d = today0();
    if (!touchesOn(dayStr(d))) d = addDays(d, -1);
    while (touchesOn(dayStr(d)) > 0) { n++; d = addDays(d, -1); }
    return n;
  }
  const chatIdea = p => { // light, no-sales openers: this month's occasion first, then their own context
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
  .progress-row { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
  .gprog { border:1px solid var(--line); border-radius:12px; padding:8px; text-align:center; background:var(--bg); }
  .gprog b { font-family:var(--display); font-weight:400; font-size:22px; font-variant-numeric:tabular-nums; }
  .gprog.met { border-color:var(--ok); background:var(--ok-bg); }
  .pick { border:1px solid var(--line); border-radius:14px; padding:12px; display:grid; gap:8px; background:var(--surface); }
  .pick .head { display:flex; gap:10px; align-items:center; }
  .pick .head b { flex:1 1 auto; min-width:0; overflow-wrap:anywhere; font-size:16px; }
  .pick .meta { font-size:13px; color:var(--muted); }
  .pick .idea { font-size:13.5px; background:var(--surface-2); border-radius:10px; padding:8px 10px; }
  .starbtn { background:none; border:0; font-size:22px; cursor:pointer; line-height:1; padding:4px; color:var(--muted); }
  .starbtn.on { color:#e0a100; }
  .plats { display:flex; flex-wrap:wrap; gap:6px; }
  .plats button { border:1px solid var(--line); background:var(--bg); border-radius:999px; padding:6px 11px; font-size:13px; font-weight:600; cursor:pointer; }
  .plats button.on { border-color:var(--accent); color:var(--accent); background:color-mix(in srgb, var(--accent) 10%, transparent); }
  .plist-row { display:grid; grid-template-columns:28px 1fr auto; gap:10px; align-items:center; padding:10px 4px; border-bottom:1px solid var(--line); cursor:pointer; }
  .plist-row:last-child { border-bottom:0; }
  .plist-row .n { min-width:0; overflow-wrap:anywhere; font-weight:700; }
  .plist-row .s { font-size:12.5px; color:var(--muted); font-weight:500; }
  .stat-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
  .stat { border:1px solid var(--line); border-radius:12px; padding:8px 10px; background:var(--bg); }
  .stat b { display:block; font-family:var(--display); font-weight:400; font-size:21px; font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }
  .stat span { font-size:12px; color:var(--muted); font-weight:700; }
  .sheet-back { position:fixed; inset:0; z-index:20; background:rgba(20,8,20,.55); display:grid; align-items:end; justify-items:center; padding:12px; padding-bottom:calc(12px + env(safe-area-inset-bottom,0px)); }
  .sheet { background:var(--surface); border-radius:18px; padding:16px; width:min(560px,100%); max-height:90vh; overflow:auto; display:grid; gap:12px; }
  .seg-g { display:flex; gap:6px; }
  .seg-g button { flex:1; border:1px solid var(--line); background:var(--bg); border-radius:10px; padding:8px 0; font-weight:800; cursor:pointer; }
  .seg-g button.on { color:#fff; border-color:transparent; }
  .timeline { display:grid; gap:6px; font-size:13.5px; }
  .timeline div { border-left:3px solid var(--line); padding-left:8px; }
  .team-table { width:100%; border-collapse:collapse; font-size:13px; font-variant-numeric:tabular-nums; }
  .team-table th, .team-table td { padding:6px 4px; border-bottom:1px solid var(--line); text-align:center; }
  .team-table th:first-child, .team-table td:first-child { text-align:left; }`;
  document.head.appendChild(css);

  /* ---------- the tab ---------- */
  let filter = { group: '', star: false, q: '' };
  function render() {
    const view = $('#view-routine'); if (!view) return;
    const plan = todayPlan(), t = todayStr();
    const doneTotal = GROUPS.reduce((n, g) => n + Math.min(plan[g].done, plan[g].target), 0), targetTotal = GROUPS.reduce((n, g) => n + plan[g].target, 0);
    const dueAll = prospects.filter(p => !p.paused && due(p).days <= 0 && !touchedToday(p)).length;
    const st = streak(), wk = weekStats(0, true);
    const counts = Object.fromEntries(GROUPS.map(g => [g, prospects.filter(p => p.group === g).length]));
    const picks = GROUPS.slice().reverse().flatMap(g => plan[g].picks.map(x => Object.assign({ g }, x)));
    view.innerHTML = `
      <div>
        <h1>定联 today</h1>
        <p class="lede">Talk first, open later. No sales intention: reply to a story, react to a post, or just chat.</p>
      </div>
      <div class="panel">
        <div class="row" style="justify-content:space-between">
          <h2>${doneTotal} of ${targetTotal} done</h2>
          <span class="chip gold">${st ? `🔥 ${st}-day streak` : 'Start your streak today'}</span>
        </div>
        <div class="progress-row">${['D', 'C', 'B', 'A'].map(g => `<div class="gprog ${plan[g].done >= plan[g].target ? 'met' : ''}"><span class="gbadge g${g}">${g}</span><br><b>${plan[g].done}/${plan[g].target}</b></div>`).join('')}</div>
        <p class="hint" style="margin:0">${dueAll ? `${dueAll} prospect${dueAll === 1 ? ' is' : 's are'} due for a chat.` : 'Nobody is overdue. Well done.'} Daily target: 3 D, 3 C, 2 B, 1 A.</p>
      </div>
      <div style="display:grid;gap:10px" id="rePicks">
        ${picks.length ? picks.map(x => pickCard(x)).join('') : `<div class="empty">${prospects.length ? 'Today’s 定联 is done. See you tomorrow!' : 'Add your first prospects to start.'}</div>`}
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
        ${team ? `<p class="hint" style="margin:0">Your numbers (not prospect names) are shared with your team leader.</p>` : ''}
      </div>
      <div class="panel">
        <div class="row" style="justify-content:space-between"><h2>My prospects</h2><span class="hint">${prospects.length} total</span></div>
        <div class="progress-row">${GROUPS.map(g => `<button type="button" class="gprog" data-fg="${g}" style="cursor:pointer;${filter.group === g ? 'border-color:var(--accent)' : ''}"><span class="gbadge g${g}">${g}</span><br><b>${counts[g]}</b></button>`).join('')}</div>
        <p class="hint" style="margin:0">Goal: move everyone up towards A. Tap a group to filter.</p>
        <div class="row">
          <input type="text" id="reSearch" placeholder="Search name or remark" value="${esc(filter.q)}" style="flex:1 1 160px">
          <button type="button" class="btn small ${filter.star ? 'primary' : ''}" id="reStarF">⭐ Favourites</button>
          ${filter.group || filter.star || filter.q ? '<button type="button" class="btn small ghost" id="reClear">Show all</button>' : ''}
        </div>
        <div id="reList">${listHtml()}</div>
        ${prospects.some(p => p.sample) ? '<button type="button" class="btn small ghost" id="reClearSamples">Remove the example prospects</button>' : ''}
      </div>
      <div class="panel">
        <h2>Reminders</h2>
        <p class="hint" style="margin:0">The app shows who to talk to every time you open this tab. Add a daily reminder to your phone calendar so you never miss a day.</p>
        <button type="button" class="btn small" id="reCal">📅 Add daily 9pm 定联 reminder</button>
      </div>
      ${team && team.owner ? '<div class="panel" id="reTeam"><h2>Team 定联 (numbers only)</h2><button type="button" class="btn small" id="reTeamBtn">Show team this week</button><div id="reTeamOut" style="overflow-x:auto"></div></div>' : ''}`;
    wire(view);
    if (typeof updateRoutineCount === 'function') updateRoutineCount();
  }
  function pickCard({ p, d, g, early }) {
    const last = p.lastTouch ? `Last chat ${Math.round((today0() - fromStr(p.lastTouch)) / 864e5)} days ago` : 'Never contacted';
    const lastNote = (p.touches || []).slice(-1)[0];
    const status = early ? 'Ahead of schedule' : d.days < 0 ? `${-d.days} day${d.days === -1 ? '' : 's'} overdue` : 'Due today';
    return `<div class="pick" data-id="${p.id}">
      <div class="head"><span class="gbadge g${p.group}">${p.group}</span><b>${esc(p.name)}</b>
        <button type="button" class="starbtn ${p.star ? 'on' : ''}" data-star="${p.id}" aria-label="Favourite">${p.star ? '★' : '☆'}</button></div>
      <div class="meta">${status} · ${last}${lastNote && lastNote.note ? ` · “${esc(lastNote.note)}”` : ''}</div>
      <div class="idea">💬 ${esc(chatIdea(p))}</div>
      <div class="row"><button type="button" class="btn small primary grow" data-talk="${p.id}">✓ Talked</button><button type="button" class="btn small" data-open="${p.id}">Details</button></div>
      <div data-log="${p.id}" hidden></div>
    </div>`;
  }
  function listHtml() {
    const q = filter.q.toUpperCase();
    const rows = prospects.filter(p => (!filter.group || p.group === filter.group) && (!filter.star || p.star) && (!q || (p.name + ' ' + (p.remark || '')).toUpperCase().includes(q)))
      .map(p => ({ p, d: due(p) })).sort((a, b) => (b.p.star - a.p.star) || (a.d.days - b.d.days));
    if (!rows.length) return '<p class="hint">No prospects here yet.</p>';
    return rows.slice(0, 300).map(({ p, d }) => `<div class="plist-row" data-open="${p.id}" role="button" tabindex="0">
      <span class="gbadge g${p.group}">${p.group}</span>
      <span class="n">${p.star ? '⭐ ' : ''}${esc(p.name)}${p.sample ? ' <span class="tag-sample">Example</span>' : ''}<br><span class="s">${esc(p.remark || (p.lastTouch ? `Last chat ${p.lastTouch}` : 'Never contacted'))}</span></span>
      <span class="s">${d.days <= 0 ? '<b style="color:var(--accent)">Due</b>' : `in ${d.days}d`}</span></div>`).join('') + (rows.length > 300 ? `<p class="hint">Showing 300 of ${rows.length}. Search to find others.</p>` : '');
  }
  function wire(view) {
    view.querySelectorAll('[data-star]').forEach(b => b.onclick = e => { e.stopPropagation(); const p = byId(b.dataset.star); p.star = !p.star; save(); render(); });
    view.querySelectorAll('[data-talk]').forEach(b => b.onclick = () => openLog(b.dataset.talk));
    view.querySelectorAll('[data-open]').forEach(b => { b.onclick = () => openProspect(b.dataset.open); b.onkeydown = e => { if (e.key === 'Enter') openProspect(b.dataset.open); }; });
    view.querySelectorAll('[data-fg]').forEach(b => b.onclick = () => { filter.group = filter.group === b.dataset.fg ? '' : b.dataset.fg; render(); });
    const s = $('#reSearch'); if (s) s.oninput = () => { filter.q = s.value; $('#reList').innerHTML = listHtml(); view.querySelectorAll('#reList [data-open]').forEach(b => b.onclick = () => openProspect(b.dataset.open)); };
    $('#reStarF').onclick = () => { filter.star = !filter.star; render(); };
    if ($('#reClear')) $('#reClear').onclick = () => { filter = { group: '', star: false, q: '' }; render(); };
    $('#reAdd').onclick = () => openAdd('');
    $('#reShot').onchange = readShots;
    $('#reCal').onclick = dailyReminder;
    if ($('#reClearSamples')) $('#reClearSamples').onclick = async () => {
      if (!(await ask('Remove the example prospects?', 'The 5 made-up examples will be deleted. Your own prospects stay.', 'Remove', true))) return;
      prospects = prospects.filter(p => !p.sample); save(); render();
    };
    if ($('#reTeamBtn')) $('#reTeamBtn').onclick = showTeam;
  }
  const byId = id => prospects.find(p => p.id === id);

  /* ---------- one-tap logging ---------- */
  function openLog(id) {
    const p = byId(id), box = document.querySelector(`[data-log="${id}"]`); if (!p || !box) return;
    let plat = p.platform || 'whatsapp';
    box.hidden = false;
    box.innerHTML = `<div style="display:grid;gap:8px">
      <div class="plats">${PLATFORMS.map(([k, l]) => `<button type="button" data-plat="${k}" class="${k === plat ? 'on' : ''}">${l}</button>`).join('')}</div>
      <input type="text" maxlength="120" placeholder="What did you talk about? (optional)" data-note>
      <div class="row"><button type="button" class="btn small primary grow" data-save>Save chat</button><button type="button" class="btn small ghost" data-cancel>Cancel</button></div></div>`;
    box.querySelectorAll('[data-plat]').forEach(b => b.onclick = () => { plat = b.dataset.plat; box.querySelectorAll('[data-plat]').forEach(x => x.classList.toggle('on', x === b)); });
    box.querySelector('[data-cancel]').onclick = () => { box.hidden = true; box.innerHTML = ''; };
    box.querySelector('[data-save]').onclick = () => {
      const note = box.querySelector('[data-note]').value.trim();
      logTouch(p, plat, note);
      toast(`Logged. Next chat with ${p.name} in ${rset.gaps[p.group]} days.`); render();
    };
    box.querySelector('[data-note]').focus();
  }
  function logTouch(p, platform, note) {
    const t = todayStr();
    p.touches = (p.touches || []).concat({ date: t, platform, note });
    p.lastTouch = t; p.platform = platform; save();
  }

  /* ---------- prospect details: group, favourite, remark, results ---------- */
  function sheet(html) {
    const back = document.createElement('div'); back.className = 'sheet-back';
    back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
    back.onclick = e => { if (e.target === back) back.remove(); };
    document.body.appendChild(back); return back;
  }
  function openProspect(id) {
    const p = byId(id); if (!p) return;
    const d = due(p), res = p.results || [];
    const back = sheet(`
      <div class="row" style="justify-content:space-between"><h2 style="overflow-wrap:anywhere">${esc(p.name)}</h2><button type="button" class="btn small ghost" data-x>Close</button></div>
      <div class="hint">${p.lastTouch ? `Last chat ${p.lastTouch}` : 'Never contacted'} · ${d.days <= 0 ? 'Due now' : `next chat in ${d.days} days`}</div>
      <div class="mini-label">Group (you decide: upgrade when you get closer)</div>
      <div class="seg-g">${GROUPS.map(g => `<button type="button" data-g="${g}" class="${p.group === g ? 'on g' + g : ''}">${g}</button>`).join('')}</div>
      <div class="hint" data-ginfo>${esc(GROUP_INFO[p.group])} · chat every ${rset.gaps[p.group]} days</div>
      <label class="check"><input type="checkbox" data-starbox ${p.star ? 'checked' : ''}> ⭐ Favourite: always shown first</label>
      <label class="field">Remark to remind yourself
        <textarea data-remark maxlength="200" style="min-height:70px" placeholder="e.g. Getting married in March. Ask about wedding prep.">${esc(p.remark || '')}</textarea></label>
      <div class="mini-label">Results</div>
      <div class="row">
        <button type="button" class="btn small" data-res="open">Opened</button>
        <button type="button" class="btn small" data-res="present">Presented</button>
        <button type="button" class="btn small primary" data-res="close">Closed</button>
      </div>
      <div data-closeform hidden></div>
      <div class="timeline">${[...res.map(r => ({ date: r.date, text: r.stage === 'close' ? `✅ Closed: ANP RM ${Number(r.anp).toLocaleString('en-MY')}, NOC ${r.noc}` : r.stage === 'present' ? '📊 Presented' : '🔓 Opened' })),
        ...(p.touches || []).map(t => ({ date: t.date, text: `💬 ${PLATFORMS.find(x => x[0] === t.platform)?.[1] || t.platform}${t.note ? `: ${t.note}` : ''}` })),
        ...(p.groupHistory || []).map(h => ({ date: h.date, text: `↕ Moved ${h.from} → ${h.to}` }))]
        .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map(x => `<div><b>${esc(x.date)}</b> ${esc(x.text)}</div>`).join('') || '<div class="hint">No chats yet.</div>'}</div>
      <div class="row"><button type="button" class="btn primary grow" data-savep>Save</button><button type="button" class="btn small danger" data-del>Delete</button></div>`);
    let group = p.group;
    const q = s => back.querySelector(s);
    back.querySelectorAll('[data-g]').forEach(b => b.onclick = () => {
      group = b.dataset.g;
      back.querySelectorAll('[data-g]').forEach(x => x.className = x.dataset.g === group ? 'on g' + group : '');
      q('[data-ginfo]').textContent = `${GROUP_INFO[group]} · chat every ${rset.gaps[group]} days`;
    });
    q('[data-x]').onclick = () => back.remove();
    back.querySelectorAll('[data-res]').forEach(b => b.onclick = async () => {
      const stage = b.dataset.res;
      if (stage !== 'close') {
        if (!(await ask(`Record “${stage === 'open' ? 'Opened' : 'Presented'}”?`, `For ${esc(p.name)}, dated today.`, 'Record'))) return;
        p.results = res.concat({ date: todayStr(), stage }); save(); back.remove(); render(); openProspect(p.id); return;
      }
      const f = q('[data-closeform]'); f.hidden = false;
      f.innerHTML = `<div class="two"><label class="mini-label">ANP (RM)<input type="number" inputmode="decimal" min="0" step="0.01" data-anp placeholder="e.g. 2400"></label>
        <label class="mini-label">NOC (cases)<input type="number" inputmode="numeric" min="1" step="1" value="1" data-noc></label></div>
        <button type="button" class="btn small primary" data-saveclose>Save close</button><div data-closeerr></div>`;
      f.querySelector('[data-saveclose]').onclick = async () => {
        const anp = Number(f.querySelector('[data-anp]').value), noc = Number(f.querySelector('[data-noc]').value);
        if (!(anp > 0)) { f.querySelector('[data-closeerr]').innerHTML = '<div class="notice bad">Enter the ANP in RM (more than 0).</div>'; return; }
        if (!Number.isInteger(noc) || noc < 1) { f.querySelector('[data-closeerr]').innerHTML = '<div class="notice bad">NOC must be a whole number of cases, 1 or more.</div>'; return; }
        if (!(await ask('Record this close?', `${esc(p.name)}: ANP RM ${anp.toLocaleString('en-MY')}, NOC ${noc}, dated today.`, 'Record close'))) return;
        p.results = res.concat({ date: todayStr(), stage: 'close', anp, noc }); save(); back.remove(); render(); toast('Close recorded. Well done!');
      };
    });
    q('[data-savep]').onclick = () => {
      if (group !== p.group) p.groupHistory = (p.groupHistory || []).concat({ date: todayStr(), from: p.group, to: group });
      const up = GROUPS.indexOf(group) < GROUPS.indexOf(p.group);
      p.group = group; p.star = q('[data-starbox]').checked; p.remark = q('[data-remark]').value.trim();
      save(); back.remove(); render(); toast(up ? `${p.name} upgraded to ${group}!` : 'Saved');
    };
    q('[data-del]').onclick = async () => {
      if (!(await ask(`Delete ${esc(p.name)}?`, 'Their chats and results will be removed from this phone. This can’t be undone.', 'Delete', true))) return;
      prospects = prospects.filter(x => x.id !== p.id); save(); back.remove(); render();
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
      if (fresh.length > 30 && !(await ask(`Add ${fresh.length} prospects?`, `They’ll all go into group ${group}. You can move people up later.`, 'Add them'))) return;
      fresh.forEach(name => prospects.push({ id: uid(), name: name.slice(0, 60), group, platform: platformGuess || '', star: false, remark: '', created: todayStr(), touches: [], results: [], groupHistory: [] }));
      save(); back.remove(); render();
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

  /* ---------- results, reminders, and numbers for the team leader ---------- */
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
  let dirty = false, timer = null;
  function markDirty() { dirty = true; if (!timer) timer = setTimeout(sync, 20000); }
  async function sync() {
    timer = null; if (!dirty || !team) return; dirty = false;
    try { await fetch('api/stats', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: settings.name || '', weeks: [weekStats(0), weekStats(1)] }) }); }
    catch { dirty = true; }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') sync(); });
  async function showTeam() {
    const out = $('#reTeamOut'); out.textContent = 'Loading…';
    try {
      const r = await callJson('api/team-stats', {}, 'team', 30000);
      const table = (wk, title) => `<p class="hint" style="margin:8px 0 4px">${title} (from ${wk.week})</p><table class="team-table"><tr><th>Agent</th><th>Chats</th><th>Days</th><th>Open</th><th>Present</th><th>Close</th><th>NOC</th><th>ANP</th></tr>
        ${wk.agents.map(a => `<tr><td style="overflow-wrap:anywhere">${esc(a.name || a.email)}</td><td>${a.touches}</td><td>${a.activeDays}</td><td>${a.opens}</td><td>${a.presents}</td><td>${a.closes}</td><td>${a.noc}</td><td>${Math.round(a.anp).toLocaleString('en-MY')}</td></tr>`).join('') || '<tr><td colspan="8">No numbers yet.</td></tr>'}</table>`;
      out.innerHTML = table(r.thisWeek, 'This week') + table(r.lastWeek, 'Last week');
    } catch (e) { out.textContent = e.message; }
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
  window.routineDueCount = () => prospects.filter(p => !p.paused && due(p).days <= 0 && !touchedToday(p)).length;
  setTimeout(markDirty, 8000); // team sign-in loads after this file, so the first sync waits a moment
})();
