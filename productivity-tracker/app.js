/* Productivity Tracker frontend. Vanilla JS, no build step. */
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Icons come from the SVG sprite in index.html.
const icon = name => `<svg class="ico"><use href="#i-${name}"/></svg>`;
const playIcon = running => icon(running ? 'stop' : 'play');

// ---------- data ----------
// store.js holds everything in this browser's localStorage. All data access goes through api().
const LOCAL = ProductivityStore.createStore(localStorage);
async function api(method, url, body) {
  try { return LOCAL.request(method, url, body); } catch (e) { alert(e.message); throw e; }
}
function exportBackup() {
  const blob = new Blob([JSON.stringify(LOCAL.request('GET', 'api/export'), null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'productivity-backup.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const PALETTE = ['#5b8cff', '#ff5b7f', '#ffb545', '#2ecc8f', '#a66bff', '#ff7a45', '#22c3e6', '#e6c822', '#f06ab8', '#7bd45c', '#ff4d4d', '#8fa3c7'];

// ---------- appearance ----------
// Per-browser preference, kept in localStorage (not in the database). style.css reads the
// data-theme and data-accent attributes this sets on <html>.
const THEMES = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']];
const ACCENTS = [['teal', 'Teal', '#14b8a6'], ['blue', 'Blue', '#2d81ff'], ['purple', 'Purple', '#7c5cff']];
// mode and minutes: how the play buttons start (stopwatch, or a countdown of `minutes`).
// tick: ticking sound wanted while something runs. tourSeen: the guided tour was finished or skipped.
const DEFAULT_PREFS = { theme: 'system', accent: 'blue', mode: 'stopwatch', minutes: 25, tick: false, tourSeen: false };
function loadPrefs() {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem('prefs') || '{}') }; } catch { return { ...DEFAULT_PREFS }; }
}
const PREFS = loadPrefs();
const systemLight = matchMedia('(prefers-color-scheme: light)');
function applyPrefs() {
  document.documentElement.dataset.theme = PREFS.theme === 'system' ? (systemLight.matches ? 'light' : 'dark') : PREFS.theme;
  document.documentElement.dataset.accent = ACCENTS.some(([v]) => v === PREFS.accent) ? PREFS.accent : 'blue';
}
function setPref(key, value) {
  PREFS[key] = value;
  try { localStorage.setItem('prefs', JSON.stringify(PREFS)); } catch { /* private mode: keep for this page load only */ }
  applyPrefs();
}
systemLight.addEventListener('change', applyPrefs);
applyPrefs();

const S = {
  projects: [], tasks: [], running: null,
  view: 'projects', timelineDays: 14,
  projectId: null,                 // project detail open
  reportPeriod: 'week',
  calMonth: startOfMonth(new Date()), calSelected: dayKey(new Date()),
};

// ---------- time helpers ----------
const now = () => Math.floor(Date.now() / 1000);
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function startOfMonth(d) { const x = new Date(d); x.setDate(1); x.setHours(0, 0, 0, 0); return x; }
function startOfWeek(d) { const x = startOfDay(d); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); return x; } // Monday
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
const epoch = d => Math.floor(d.getTime() / 1000);
function dayKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function fmtTime(e) { return new Date(e * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function fmtDur(s) {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${s}s`;
}
// Whole minutes as "15m", "1h", "1h30m": the task row's estimate line.
function fmtMin(m) { const h = Math.floor(m / 60), r = m % 60; return h ? `${h}h${r ? `${r}m` : ''}` : `${r}m`; }
// "15m" untouched, "10m left of 15m" while time is left, "over by 3m of 15m" after. own: seconds tracked on the task itself.
function estimateText(estimate, own) {
  if (!own) return fmtMin(estimate);
  const left = estimate * 60 - own;
  return left > 0 ? `${fmtMin(Math.ceil(left / 60))} left of ${fmtMin(estimate)}` : `over by ${fmtMin(Math.floor(-left / 60))} of ${fmtMin(estimate)}`;
}
function fmtClock(s) {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
function fmtDay(d) {
  const t = startOfDay(new Date()), x = startOfDay(d);
  if (x.getTime() === t.getTime()) return 'Today';
  if (x.getTime() === addDays(t, -1).getTime()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}
function toLocalInput(e) { const d = new Date(e * 1000); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
function fromLocalInput(s) { return Math.floor(new Date(s).getTime() / 1000); }

// Split a record into per-day segments [{key, start, end, last}] so day totals are correct across midnight.
// `last` marks the final segment; for a running record that is the one still growing.
function segments(r) {
  const out = [];
  let s = r.start; const e = r.end ?? now();
  while (s < e) {
    const dayEnd = epoch(addDays(startOfDay(new Date(s * 1000)), 1));
    const segEnd = Math.min(e, dayEnd);
    out.push({ key: dayKey(new Date(s * 1000)), start: s, end: segEnd, last: false });
    s = segEnd;
  }
  if (out.length) out[out.length - 1].last = true;
  return out;
}

const proj = id => S.projects.find(p => p.id === id);
const task = id => S.tasks.find(t => t.id === id);
// Tasks of a project in tree order, children right after their parent: [{ t, depth }], depth 1 for a top-level task.
function taskTree(pid) {
  const all = S.tasks.filter(t => t.project_id === pid), out = [];
  const walk = (parent, depth) => { for (const t of all) if ((t.parent_id ?? null) === parent) { out.push({ t, depth }); walk(t.id, depth + 1); } };
  walk(null, 1);
  return out;
}
const descendants = id => S.tasks.filter(t => t.parent_id === id).flatMap(c => [c, ...descendants(c.id)]);
const MAX_TASK_DEPTH = 3;
const dur = r => (r.end ?? now()) - r.start;

// ---------- data ----------
async function loadState() {
  const st = await api('GET', 'api/state');
  S.projects = st.projects; S.tasks = st.tasks; S.running = st.running;
}
async function fetchRecords(fromEpoch, toEpoch) {
  return api('GET', `api/records?from=${fromEpoch}&to=${toEpoch}`);
}
async function startTimer(project_id, task_id = null) {
  const body = { project_id, task_id };
  // A task with an estimate counts down what is left of it (the store decides); the chip applies to everything else.
  if (PREFS.mode === 'countdown' && task(task_id)?.estimate == null) body.minutes = PREFS.minutes;
  await api('POST', 'api/timer/start', body);
  await refresh();
}
async function stopTimer() { await api('POST', 'api/timer/stop'); await refresh(); }

async function refresh() { await loadState(); render(); }
const FAR_FUTURE = 4102444800;  // 2100-01-01, for "every record" queries
const allRecords = () => fetchRecords(0, FAR_FUTURE);

// ---------- undo after delete ----------
// A delete happens at once. The removed rows are kept for UNDO_SECONDS and Undo merges them back
// with api/import?mode=merge, which restores rows by id, records included. A new delete replaces
// the previous offer.
const UNDO_SECONDS = 8;
let undoRows = null, undoTimer = 0;
function offerUndo(what, rows) {
  undoRows = { version: 2, projects: [], tasks: [], records: [], ...rows };
  $('#undoText').textContent = `Deleted ${what}.`;
  $('#undo').hidden = false;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(dismissUndo, UNDO_SECONDS * 1000);
}
function dismissUndo() { clearTimeout(undoTimer); undoRows = null; $('#undo').hidden = true; }
async function undoDelete() {
  const rows = undoRows;
  dismissUndo();
  if (!rows) return;
  await api('POST', 'api/import?mode=merge', rows);
  refresh();
}

// ---------- rendering ----------
const view = $('#view');

function setView(v) { S.view = v; S.projectId = null; render(); }

function render() {
  $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === S.view));
  $('#backBtn').hidden = !(S.view === 'projects' && S.projectId);
  renderRunbar();
  const fns = { timeline: renderTimeline, projects: renderProjects, reports: renderReports, calendar: renderCalendar };
  const done = fns[S.view]();
  done.then(() => { if (tourStep >= 0) showTourStep(tourStep); });  // a re-render mid-tour rebuilds the demo elements
  return done;
}

function renderRunbar() {
  const bar = $('#runbar'), r = S.running;
  bar.hidden = !r;
  syncTick();
  if (!r) return;
  const p = proj(r.project_id), t = r.task_id ? task(r.task_id) : null;
  $('#runDot').style.background = p?.color || '#888';
  $('#runProject').textContent = p?.name || '?';
  $('#runTask').textContent = t?.name || 'No task';
  $('#runKind').hidden = r.planned_end == null;
  tickRunbar();
}
let countdownDone = null; // id of the countdown whose end this page already handled
function tickRunbar() {
  const r = S.running;
  if (r && r.planned_end != null) {
    const left = r.planned_end - now();
    $('#runTime').textContent = fmtClock(Math.max(0, left));
    $('#runTime').classList.toggle('low', left < 60);
    if (left <= 0 && countdownDone !== r.id) { countdownDone = r.id; chime(); refresh(); }
  } else if (r) {
    $('#runTime').textContent = fmtClock(now() - r.start);
    $('#runTime').classList.remove('low');
  }
  $$('.rec.live .dur').forEach(el => { el.textContent = fmtDur(now() - Number(el.dataset.start)); });
}
// Two short rising notes when a countdown reaches zero. Synthesized, under a second.
function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    for (const [freq, at] of [[880, 0], [1320, 0.18]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = freq; o.connect(g).connect(ctx.destination);
      const t0 = ctx.currentTime + at;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      o.start(t0); o.stop(t0 + 0.55);
    }
    setTimeout(() => ctx.close(), 1500);
  } catch { /* no audio available */ }
}

// ---------- start mode: stopwatch or countdown ----------
const PRESETS = [15, 25, 45, 60];
// The length drawer slides out to the right of the chips when Countdown is active. Clicks toggle
// classes in place rather than re-rendering, so the CSS transition is visible.
function modeRowHtml() {
  const cd = PREFS.mode === 'countdown';
  const custom = !PRESETS.includes(PREFS.minutes);
  return `<div class="mode-row ${cd ? 'open' : ''}">
    <button class="chip ${cd ? '' : 'active'}" data-start-mode="stopwatch">${icon('timer')}Stopwatch</button>
    <button class="chip ${cd ? 'active' : ''}" data-start-mode="countdown">${icon('hourglass')}Countdown</button>
    <div class="drawer" aria-label="Countdown length in minutes">
      ${PRESETS.map(m => `<button class="chip ${PREFS.minutes === m ? 'active' : ''}" data-min="${m}">${m}</button>`).join('')}
      <input class="min-input ${custom ? 'active' : ''}" type="number" min="1" max="720" inputmode="numeric" placeholder="min" aria-label="Custom minutes" value="${custom ? PREFS.minutes : ''}">
    </div></div>`;
}
function bindModeRow() {
  const row = $('.mode-row', view);
  if (!row) return;
  const markLength = active => {
    $$('[data-min]', row).forEach(x => x.classList.toggle('active', +x.dataset.min === active));
    $('.min-input', row).classList.toggle('active', !PRESETS.includes(active));
  };
  $$('[data-start-mode]', row).forEach(b => b.onclick = () => {
    const m = b.dataset.startMode;
    setPref('mode', m);
    row.classList.toggle('open', m === 'countdown');
    $$('[data-start-mode]', row).forEach(x => x.classList.toggle('active', x === b));
  });
  $$('[data-min]', row).forEach(b => b.onclick = () => {
    setPref('minutes', +b.dataset.min);
    $('.min-input', row).value = '';
    markLength(PREFS.minutes);
  });
  $('.min-input', row).onchange = e => {
    const v = parseInt(e.target.value, 10);
    if (!v) return;
    setPref('minutes', Math.min(720, Math.max(1, v)));
    e.target.value = PREFS.minutes;
    markLength(PREFS.minutes);
  };
}
setInterval(tickRunbar, 1000);

// --- Timeline ---
async function renderTimeline() {
  const from = epoch(addDays(startOfDay(new Date()), -(S.timelineDays - 1)));
  const recs = await fetchRecords(from, now() + 86400);
  if (!S.projects.length) {
    view.innerHTML = `<div class="empty">Create a project first.<br><button class="add-card" id="addProj">+ New project</button></div>`;
    $('#addProj').onclick = () => openProjectDialog(null);
    return;
  }
  if (!recs.length) {
    view.innerHTML = `<div class="empty">Nothing tracked in the last ${S.timelineDays} days.<br>Start a timer from Projects, or<br><button class="add-card" id="addRec">+ Add record</button></div>`;
    $('#addRec').onclick = () => openRecordDialog(null);
    return;
  }
  // One row per day segment, so a record crossing midnight is listed under both days
  // and day totals match Calendar and Reports.
  const byDay = new Map();
  for (const r of recs) for (const s of segments(r)) {
    if (s.end <= from) continue;
    if (!byDay.has(s.key)) byDay.set(s.key, []);
    byDay.get(s.key).push({ r, s });
  }
  let html = `<div class="row" style="justify-content:flex-end"><button class="linkbtn" id="addRec">+ Add record</button></div>`;
  for (const k of [...byDay.keys()].sort().reverse()) {
    const list = byDay.get(k).sort((a, b) => b.s.start - a.s.start);
    const total = list.reduce((a, x) => a + (x.s.end - x.s.start), 0);
    html += `<div class="section-title">${esc(fmtDay(new Date(k + 'T00:00')))}<span class="right">${fmtDur(total)}</span></div>`;
    html += list.map(x => recHtml(x.r, x.s)).join('');
  }
  html += `<button class="load-more" id="moreBtn">Show earlier</button>`;
  view.innerHTML = html;
  $('#addRec').onclick = () => openRecordDialog(null);
  $('#moreBtn').onclick = () => { S.timelineDays += 14; renderTimeline(); };
  $$('.rec', view).forEach(el => el.onclick = () => openRecordDialog(recs.find(r => r.id === el.dataset.id)));
}
// Row for a record. With `seg` (from segments()) the row shows only that day's part of the record;
// clicking still opens the whole record.
function recHtml(r, seg) {
  const p = proj(r.project_id), t = r.task_id ? task(r.task_id) : null;
  const live = r.end == null && (seg ? seg.last : true);
  const start = seg ? seg.start : r.start;
  const end = seg ? seg.end : (r.end ?? now());
  return `<div class="rec ${live ? 'live' : ''}" data-id="${r.id}">
    <div class="bar" style="background:${p?.color || '#888'}"></div>
    <div class="body"><div class="name">${esc(p?.name || '?')}</div>
      <div class="sub">${t ? esc(t.name) + ' · ' : ''}${fmtTime(start)} – ${live ? 'now' : fmtTime(end)}</div></div>
    <div class="dur" data-start="${start}">${fmtDur(end - start)}</div></div>`;
}

// --- Projects ---
async function renderProjects() {
  if (S.projectId) return renderProjectDetail();
  const todayFrom = epoch(startOfDay(new Date()));
  const recs = await fetchRecords(todayFrom, now() + 1);
  const today = {};
  for (const r of recs) for (const s of segments(r)) if (s.key === dayKey(new Date())) today[r.project_id] = (today[r.project_id] || 0) + (s.end - s.start);
  const active = S.projects.filter(p => !p.archived), archived = S.projects.filter(p => p.archived);
  if (!S.projects.length) {
    view.innerHTML = `<div class="empty">No projects yet.<br><button class="add-card" id="addProj">+ New project</button>
      ${PREFS.tourSeen ? '' : '<br><button class="btn tour-btn" id="tourBtn">Take the tour</button>'}</div>`;
    $('#addProj').onclick = () => openProjectDialog(null);
    if ($('#tourBtn')) $('#tourBtn').onclick = startTour;
    return;
  }
  const card = p => projectCardHtml(p, today[p.id] || 0);
  view.innerHTML = modeRowHtml() + `<button class="add-card" id="addProj">+ New project</button>` +
    active.map(card).join('') +
    (archived.length ? `<div class="section-title">Archived</div>` + archived.map(card).join('') : '');
  bindModeRow();
  $('#addProj').onclick = () => openProjectDialog(null);
  $$('.proj', view).forEach(el => el.onclick = () => { S.projectId = el.dataset.id; render(); });
  $$('[data-play]', view).forEach(b => b.onclick = e => { e.stopPropagation(); togglePlay(b.dataset.play, null); });
}
// One row of the project list. todaySecs: time tracked on it today.
function projectCardHtml(p, todaySecs) {
  const on = S.running && S.running.project_id === p.id;
  const open = S.tasks.filter(t => t.project_id === p.id && !t.completed).length;
  return `<div class="proj" data-id="${p.id}" style="border-left-color:${p.color}">
    <div class="body"><div class="name">${esc(p.name)}</div>
      <div class="sub">${fmtDur(todaySecs)} today${open ? ` · ${open} open task${open > 1 ? 's' : ''}` : ''}</div></div>
    <button class="play ${on ? 'on' : ''}" data-play="${p.id}" title="${on ? 'Stop' : 'Start'}">${playIcon(on)}</button></div>`;
}
function togglePlay(pid, tid) {
  const r = S.running;
  if (r && r.project_id === pid && (r.task_id ?? null) === (tid ?? null)) return stopTimer();
  return startTimer(pid, tid);
}
async function renderProjectDetail() {
  const p = proj(S.projectId);
  if (!p) { S.projectId = null; return render(); }
  const weekFrom = epoch(startOfWeek(new Date()));
  const recs = (await fetchRecords(0, now() + 1)).filter(r => r.project_id === p.id);
  const total = recs.reduce((a, r) => a + dur(r), 0);
  const week = recs.reduce((a, r) => a + segments(r).filter(s => s.start >= weekFrom).reduce((x, s) => x + (s.end - s.start), 0), 0);
  const tasks = taskTree(p.id);
  // Time per task, all time, with sub-task time rolled into the parent. Reverse tree order visits children before parents.
  const taskTime = {}, ownTime = {};  // ownTime: the task's records only, for its estimate line
  for (const r of recs) if (r.task_id) taskTime[r.task_id] = (taskTime[r.task_id] || 0) + dur(r);
  Object.assign(ownTime, taskTime);
  for (const { t } of [...tasks].reverse()) if (t.parent_id) taskTime[t.parent_id] = (taskTime[t.parent_id] || 0) + (taskTime[t.id] || 0);
  const on = S.running && S.running.project_id === p.id && S.running.task_id == null;
  const taskHtml = ({ t, depth }) => {
    const tOn = S.running && S.running.task_id === t.id;
    return `<div class="task d${depth} ${t.completed ? 'done' : ''}" data-id="${t.id}">
      <input type="checkbox" ${t.completed ? 'checked' : ''} data-done="${t.id}">
      <span class="tname" data-edit="${t.id}">${esc(t.name)}</span>
      ${taskTime[t.id] ? `<span class="ttime">${fmtDur(taskTime[t.id])}</span>` : ''}
      ${t.estimate != null ? `<span class="testim" title="Estimate">${estimateText(t.estimate, ownTime[t.id] || 0)}</span>` : ''}
      ${depth < MAX_TASK_DEPTH ? `<button class="linkbtn sub" data-sub="${t.id}" title="Add a sub-task">+ Sub</button>` : ''}
      <button class="play sm ${tOn ? 'on' : ''}" data-play="${t.id}" style="${tOn ? '' : 'background:' + p.color}" title="${tOn ? 'Stop' : 'Start'}">${playIcon(tOn)}</button></div>`;
  };
  view.innerHTML = modeRowHtml() + `
    <div class="proj-name">${esc(p.name)}</div>
    <div class="proj-head" style="background:${p.color}">
      <div style="flex:1"><div class="big">${fmtDur(total)}</div><div class="sub">total · ${fmtDur(week)} this week</div></div>
      <button class="play ${on ? 'on' : ''}" id="projPlay" style="background:rgba(0,0,0,.3)" title="${on ? 'Stop' : 'Start'}">${playIcon(on)}</button>
    </div>
    <div class="row" style="gap:16px;margin-bottom:6px">
      <button class="linkbtn" id="editProj">Edit</button>
      <button class="linkbtn" id="archProj">${p.archived ? 'Unarchive' : 'Archive'}</button>
      <button class="linkbtn danger" id="delProj">Delete</button>
    </div>
    <div class="section-title">Tasks <button class="linkbtn right" id="addTask">+ Add task</button></div>
    ${tasks.length ? tasks.map(taskHtml).join('') : '<div class="muted" style="padding:8px 4px">No task has been added yet.</div>'}
    <div class="section-title">Recent</div>
    ${recs.slice(0, 20).map(r => recHtml(r)).join('') || '<div class="muted" style="padding:8px 4px">No recent records available.</div>'}`;
  bindModeRow();
  $('#projPlay').onclick = () => togglePlay(p.id, null);
  $('#editProj').onclick = () => openProjectDialog(p);
  $('#archProj').onclick = async () => { await api('PUT', `api/projects/${p.id}`, { archived: !p.archived }); refresh(); };
  $('#delProj').onclick = async () => {
    const rows = { projects: [p], tasks: S.tasks.filter(t => t.project_id === p.id), records: (await allRecords()).filter(r => r.project_id === p.id) };
    await api('DELETE', `api/projects/${p.id}`); S.projectId = null; await refresh();
    offerUndo(`"${p.name}" with ${rows.records.length} record${rows.records.length === 1 ? '' : 's'}`, rows);
  };
  $('#addTask').onclick = () => openTaskDialog(null, p.id);
  $$('[data-done]', view).forEach(c => c.onchange = async () => { await api('PUT', `api/tasks/${c.dataset.done}`, { completed: c.checked }); refresh(); });
  $$('[data-edit]', view).forEach(el => el.onclick = () => openTaskDialog(task(el.dataset.edit), p.id));
  $$('[data-sub]', view).forEach(b => b.onclick = () => openTaskDialog(null, p.id, b.dataset.sub));
  $$('[data-play]', view).forEach(b => b.onclick = () => togglePlay(p.id, b.dataset.play));
  $$('.rec', view).forEach(el => el.onclick = () => openRecordDialog(recs.find(r => r.id === el.dataset.id)));
}

// --- Reports ---
function periodRange(kind) {
  const t = startOfDay(new Date());
  if (kind === 'week') return [startOfWeek(t), addDays(startOfWeek(t), 7)];
  if (kind === '7d') return [addDays(t, -6), addDays(t, 1)];
  if (kind === 'month') return [startOfMonth(t), startOfMonth(addDays(startOfMonth(t), 32))];
  if (kind === '30d') return [addDays(t, -29), addDays(t, 1)];
  return [new Date(0), addDays(t, 1)];
}
async function renderReports() {
  const [from, to] = periodRange(S.reportPeriod);
  const recs = await fetchRecords(epoch(from), epoch(to));
  const periods = [['week', 'This week'], ['7d', 'Last 7 days'], ['month', 'This month'], ['30d', 'Last 30 days'], ['all', 'All time']];
  const chips = periods.map(([k, l]) => `<button class="chip ${S.reportPeriod === k ? 'active' : ''}" data-p="${k}">${l}</button>`).join('');

  // clip segments to the period
  const segs = [];
  for (const r of recs) for (const s of segments(r)) {
    const a = Math.max(s.start, epoch(from)), b = Math.min(s.end, epoch(to));
    if (b > a) segs.push({ key: s.key, start: a, end: b, project_id: r.project_id });
  }
  const total = segs.reduce((a, s) => a + s.end - s.start, 0);
  const dayKeys = new Set(segs.map(s => s.key));
  const byProj = {};
  for (const s of segs) byProj[s.project_id] = (byProj[s.project_id] || 0) + s.end - s.start;
  const projIds = Object.keys(byProj).sort((a, b) => byProj[b] - byProj[a]);

  // daily stacked chart (period days, max 31; for 'all' use last 14 days)
  let days = [];
  const dFrom = S.reportPeriod === 'all' ? addDays(startOfDay(new Date()), -13) : from;
  const dTo = S.reportPeriod === 'all' ? addDays(startOfDay(new Date()), 1) : to;
  for (let d = new Date(dFrom); d < dTo; d = addDays(d, 1)) days.push(dayKey(d));
  const dailySeries = projIds.map(pid => ({ color: proj(pid)?.color || '#888', values: days.map(k => segs.filter(s => s.key === k && s.project_id === pid).reduce((a, s) => a + s.end - s.start, 0) / 3600) }));
  const dayLabels = days.map(k => { const d = new Date(k + 'T00:00'); return days.length > 10 ? String(d.getDate()) : d.toLocaleDateString([], { weekday: 'short' }); });

  // weekly chart: last 8 weeks regardless of period
  const wRecs = await fetchRecords(epoch(addDays(startOfWeek(new Date()), -49)), now() + 1);
  const weeks = []; for (let i = 7; i >= 0; i--) weeks.push(addDays(startOfWeek(new Date()), -7 * i));
  const weekVals = weeks.map(w => { const a = epoch(w), b = epoch(addDays(w, 7)); let t = 0; for (const r of wRecs) { const s = Math.max(r.start, a), e = Math.min(r.end ?? now(), b); if (e > s) t += e - s; } return t / 3600; });
  const weekLabels = weeks.map(w => `${w.getMonth() + 1}/${w.getDate()}`);

  // hour-of-day productivity (period)
  const hours = new Array(24).fill(0);
  for (const s of segs) { let a = s.start; while (a < s.end) { const d = new Date(a * 1000); const hEnd = epoch(new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1)); const b = Math.min(hEnd, s.end); hours[d.getHours()] += (b - a) / 3600; a = b; } }
  const bestHour = hours.indexOf(Math.max(...hours));

  view.innerHTML = `
    <div class="chip-row">${chips}</div>
    <div class="card"><div class="stat">
      <div><b>${fmtDur(total)}</b><small>tracked</small></div>
      <div><b>${dayKeys.size}</b><small>active days</small></div>
      <div><b>${dayKeys.size ? fmtDur(total / dayKeys.size) : '0m'}</b><small>per active day</small></div>
    </div></div>
    <div class="section-title">Daily</div>
    <div class="card">${barChart(dayLabels, dailySeries, 'h')}
      <div class="legend">${projIds.map(pid => `<span><i class="dot" style="background:${proj(pid)?.color}"></i>${esc(proj(pid)?.name)}</span>`).join('')}</div></div>
    <div class="section-title">Weekly (last 8 weeks)</div>
    <div class="card">${barChart(weekLabels, [{ color: 'var(--accent)', values: weekVals }], 'h')}</div>
    <div class="section-title">Most productive hours${total ? `<span class="right">peak ${String(bestHour).padStart(2, '0')}:00–${String(bestHour + 1).padStart(2, '0')}:00</span>` : ''}</div>
    <div class="card">${barChart(hours.map((_, i) => i % 3 === 0 ? String(i) : ''), [{ color: 'var(--accent2)', values: hours }], 'h')}</div>
    <div class="section-title">By project</div>
    <div class="card">${projIds.length ? projIds.map(pid => `<div class="hbar"><div class="lab"><span>${esc(proj(pid)?.name)}</span><span>${fmtDur(byProj[pid])} · ${Math.round(byProj[pid] / total * 100)}%</span></div><div class="track"><div class="fill" style="width:${byProj[pid] / total * 100}%;background:${proj(pid)?.color}"></div></div></div>`).join('') : '<div class="muted">No data in this period.</div>'}</div>`;
  $$('[data-p]', view).forEach(b => b.onclick = () => { S.reportPeriod = b.dataset.p; renderReports(); });
}

// Stacked bar chart as inline SVG. series: [{color, values[]}], values in hours.
function barChart(labels, series, unit) {
  const W = 480, H = 180, padL = 34, padB = 22, padT = 8;
  const n = labels.length;
  const totals = labels.map((_, i) => series.reduce((a, s) => a + (s.values[i] || 0), 0));
  const max = Math.max(1, ...totals) * 1.1;
  const cw = (W - padL - 6) / n, bw = Math.max(2, cw * 0.62);
  const y = v => padT + (H - padT - padB) * (1 - v / max);
  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const v = max / ticks * i, yy = y(v);
    svg += `<line x1="${padL}" x2="${W - 4}" y1="${yy}" y2="${yy}" stroke="var(--border)" stroke-width="1"/>`;
    svg += `<text x="${padL - 6}" y="${yy + 4}" fill="var(--muted)" font-size="10" text-anchor="end">${v >= 10 ? Math.round(v) : v.toFixed(1)}${unit}</text>`;
  }
  labels.forEach((lab, i) => {
    const x = padL + cw * i + (cw - bw) / 2;
    let acc = 0;
    for (const s of series) {
      const v = s.values[i] || 0; if (!v) continue;
      const y1 = y(acc + v), y0 = y(acc);
      svg += `<rect x="${x}" y="${y1}" width="${bw}" height="${Math.max(1, y0 - y1)}" rx="2" fill="${s.color}"><title>${v.toFixed(2)}${unit}</title></rect>`;
      acc += v;
    }
    if (lab) svg += `<text x="${x + bw / 2}" y="${H - 6}" fill="var(--muted)" font-size="10" text-anchor="middle">${esc(lab)}</text>`;
  });
  return svg + '</svg>';
}

// --- Calendar ---
async function renderCalendar() {
  const m = S.calMonth;
  const gridStart = startOfWeek(m), gridEnd = addDays(gridStart, 42);
  const recs = await fetchRecords(epoch(gridStart), epoch(gridEnd));
  const dayTotal = {}, dayProjects = {};
  for (const r of recs) for (const s of segments(r)) {
    dayTotal[s.key] = (dayTotal[s.key] || 0) + s.end - s.start;
    (dayProjects[s.key] ||= new Set()).add(r.project_id);
  }
  const todayKey = dayKey(new Date());
  let cells = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => `<div class="dow">${d}</div>`).join('');
  for (let d = new Date(gridStart); d < gridEnd; d = addDays(d, 1)) {
    const k = dayKey(d);
    const cls = ['cal-day', d.getMonth() !== m.getMonth() ? 'other' : '', k === todayKey ? 'today' : '', k === S.calSelected ? 'sel' : ''].join(' ');
    const dots = [...(dayProjects[k] || [])].slice(0, 4).map(pid => `<i style="background:${proj(pid)?.color}"></i>`).join('');
    cells += `<div class="${cls}" data-day="${k}"><span>${d.getDate()}</span>${dayTotal[k] ? `<small>${fmtDur(dayTotal[k])}</small>` : ''}<div class="dots">${dots}</div></div>`;
  }
  // Rows for the selected day show that day's segment only, matching the day total above them.
  const selRows = recs.flatMap(r => segments(r).filter(s => s.key === S.calSelected).map(s => ({ r, s }))).sort((a, b) => b.s.start - a.s.start);
  const monthTotal = Object.entries(dayTotal).filter(([k]) => k.startsWith(dayKey(m).slice(0, 7))).reduce((a, [, v]) => a + v, 0);
  view.innerHTML = `
    <div class="cal-head"><button class="icon-btn" id="prevM" title="Previous month">${icon('prev')}</button>
      <div style="text-align:center"><b>${m.toLocaleDateString([], { month: 'long', year: 'numeric' })}</b><div class="muted" style="font-size:12px">${fmtDur(monthTotal)} this month</div></div>
      <button class="icon-btn" id="nextM" title="Next month">${icon('next')}</button></div>
    <div class="cal-grid">${cells}</div>
    <div class="section-title">${esc(fmtDay(new Date(S.calSelected + 'T00:00')))} · ${fmtDur(dayTotal[S.calSelected] || 0)}<button class="linkbtn right" id="addRec">+ Add record</button></div>
    ${selRows.map(x => recHtml(x.r, x.s)).join('') || '<div class="muted" style="padding:8px 4px">Nothing tracked.</div>'}`;
  $('#addRec').onclick = () => {
    // pre-fill the selected day: 09:00 to 10:00, or the last hour if the day is today
    const sel = new Date(S.calSelected + 'T00:00');
    const defaults = S.calSelected === todayKey ? null : { start: epoch(sel) + 9 * 3600, end: epoch(sel) + 10 * 3600 };
    openRecordDialog(null, defaults);
  };
  $('#prevM').onclick = () => { S.calMonth = startOfMonth(addDays(m, -1)); renderCalendar(); };
  $('#nextM').onclick = () => { S.calMonth = startOfMonth(addDays(m, 32)); renderCalendar(); };
  $$('[data-day]', view).forEach(el => el.onclick = () => { S.calSelected = el.dataset.day; renderCalendar(); });
  $$('.rec', view).forEach(el => el.onclick = () => openRecordDialog(recs.find(r => r.id === el.dataset.id)));
}

// ---------- dialogs ----------
const dlg = $('#dlg');
function openDialog(html, onSubmit) {
  dlg.innerHTML = `<form method="dialog">${html}</form>`;
  delete dlg.dataset.kind;
  const form = $('form', dlg);
  const submit = async action => { if (await onSubmit(new FormData(form), action) !== false) dlg.close(); };
  // Enter in a field submits the form through its first submit button, and Cancel and Delete come
  // before Save. So they are plain buttons: Enter reaches Save, and the browser does not block
  // Cancel on an empty required field.
  $$('button[value="cancel"]', form).forEach(b => { b.type = 'button'; b.onclick = () => dlg.close(); });
  $$('button[value="delete"]', form).forEach(b => { b.type = 'button'; b.onclick = () => submit('delete'); });
  form.onsubmit = e => { e.preventDefault(); submit(e.submitter?.value); };
  dlg.showModal();
}
const colorPicker = sel => `<div class="field"><label>Color</label><div class="colors">${PALETTE.map(c => `<label style="background:${c}"><input type="radio" name="color" value="${c}" ${c === sel ? 'checked' : ''}><span></span></label>`).join('')}</div></div>`;

function openProjectDialog(p) {
  const color = p?.color || PALETTE[S.projects.length % PALETTE.length];
  openDialog(`<h2>${p ? 'Edit project' : 'New project'}</h2>
    <div class="field"><label>Name</label><input name="name" required autofocus value="${esc(p?.name || '')}"></div>
    ${colorPicker(color)}
    <div class="actions"><button class="btn" value="cancel">Cancel</button><button class="btn primary" value="ok">Save</button></div>`,
    async fd => {
      const data = { name: fd.get('name'), color: fd.get('color') };
      if (p) await api('PUT', `api/projects/${p.id}`, data); else { const np = await api('POST', 'api/projects', data); if (S.view === 'projects') S.projectId = np.id; }
      refresh();
    });
}
// Pasted text with line breaks becomes one task per non-empty line. A leading list marker
// ("- ", "* ", "1. ", "1)", "[ ] ") is dropped. Returns [] for single-line text.
const TASK_LINE_MARKER = /^\s*(?:(?:[-*+\u2022]|\d+[.)])\s+)?(?:\[[ xX]\]\s+)?/;
function splitTaskLines(text) {
  const lines = text.split(/\r?\n/).map(l => l.replace(TASK_LINE_MARKER, '').trim()).filter(Boolean);
  return lines.length > 1 ? lines : [];
}
const CONFIRM_TASKS_ABOVE = 5;
// t: task to edit, or null to add. parentId: parent of a new sub-task; the parent cannot be changed later.
function openTaskDialog(t, pid, parentId = null) {
  const parent = parentId ? task(parentId) : null;
  openDialog(`<h2>${t ? 'Edit task' : parent ? 'New sub-task' : 'New task'}</h2>
    ${parent ? `<p class="muted" style="margin:-10px 0 14px">Under ${esc(parent.name)}</p>` : ''}
    <div class="field"><label>Name</label><input name="name" required autofocus value="${esc(t?.name || '')}">
      <div class="muted" style="font-size:12px;margin-top:4px">End with ! and a length for an estimate, for example "!25 min".${t ? '' : ' Paste several lines to add one task per line.'}</div></div>
    ${t ? `<div class="field"><label>Estimate (minutes)</label><input type="number" name="estimate" min="1" max="720" step="1" placeholder="none" value="${t.estimate ?? ''}"></div>` : ''}
    <div class="actions">${t ? '<button class="btn danger" value="delete">Delete</button>' : ''}<button class="btn" value="cancel">Cancel</button><button class="btn primary" value="ok">Save</button></div>`,
    async (fd, action) => {
      if (action === 'delete') {
        const tasks = [t, ...descendants(t.id)], ids = new Set(tasks.map(x => x.id));
        const rows = { tasks, records: (await allRecords()).filter(r => ids.has(r.task_id)) };
        await api('DELETE', `api/tasks/${t.id}`); await refresh();
        const n = tasks.length - 1;
        return offerUndo(`"${t.name}"${n ? ` and ${n} sub-task${n > 1 ? 's' : ''}` : ''}`, rows);
      }
      const { name, estimate } = ProductivityStore.parseTaskLine(fd.get('name'));
      if (t) {
        // A length typed after "!" in the name wins over the field; a blank field clears the estimate.
        const field = fd.get('estimate').trim();
        await api('PUT', `api/tasks/${t.id}`, { name, estimate: estimate ?? (field ? parseInt(field, 10) : null) });
      } else await api('POST', 'api/tasks', { name, project_id: pid, parent_id: parentId, estimate });
      refresh();
    });
  if (t) return;
  $('input[name=name]', dlg).onpaste = async e => {
    const names = splitTaskLines(e.clipboardData?.getData('text') || '');
    if (!names.length) return;  // one line: the normal paste
    e.preventDefault();
    if (names.length > CONFIRM_TASKS_ABOVE && !confirm(`Create ${names.length} tasks?`)) return;
    for (const line of names) await api('POST', 'api/tasks', { ...ProductivityStore.parseTaskLine(line), project_id: pid, parent_id: parentId });
    dlg.close();
    refresh();
  };
}
// r: record to edit, or null to add. defaults: optional {start, end} for a new record.
function openRecordDialog(r, defaults) {
  const isNew = !r;
  const pid = r?.project_id ?? S.projectId ?? S.projects.find(p => !p.archived)?.id;
  if (!pid) return openProjectDialog(null);
  const start = r?.start ?? defaults?.start ?? (now() - 3600), end = r?.end ?? defaults?.end ?? now();
  const projOpts = S.projects.filter(p => !p.archived || p.id === pid).map(p => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  openDialog(`<h2>${isNew ? 'Add record' : 'Edit record'}</h2>
    <div class="field"><label>Project</label><select name="project_id" id="recProj">${projOpts}</select></div>
    <div class="field"><label>Task</label><select name="task_id" id="recTask"></select></div>
    <div class="field"><label>Start</label><input type="datetime-local" name="start" required value="${toLocalInput(start)}"></div>
    <div class="field"><label>End</label><input type="datetime-local" name="end" ${r && r.end == null ? '' : 'required'} value="${toLocalInput(end)}">${r && r.end == null ? '<div class="muted" style="font-size:12px;margin-top:4px">Running — leave end as is or stop the timer.</div>' : ''}</div>
    <div class="actions">${isNew ? '' : '<button class="btn danger" value="delete">Delete</button>'}<button class="btn" value="cancel">Cancel</button><button class="btn primary" value="ok">Save</button></div>`,
    async (fd, action) => {
      if (action === 'delete') { await api('DELETE', `api/records/${r.id}`); await refresh(); return offerUndo(`a ${fmtDur(dur(r))} record`, { records: [r] }); }
      const data = { project_id: fd.get('project_id'), task_id: fd.get('task_id') || null, start: fromLocalInput(fd.get('start')) };
      if (isNew || r.end != null) data.end = fromLocalInput(fd.get('end'));
      if (data.end != null && data.end <= data.start) { alert('End must be after start.'); return false; }
      if (isNew) await api('POST', 'api/records', data); else await api('PUT', `api/records/${r.id}`, data);
      refresh();
    });
  const fillTasks = () => {
    const p = $('#recProj').value;
    $('#recTask').innerHTML = `<option value="">No task</option>` + taskTree(p).map(({ t, depth }) => `<option value="${t.id}" ${t.id === r?.task_id ? 'selected' : ''}>${'\u00a0\u00a0\u00a0'.repeat(depth - 1)}${esc(t.name)}</option>`).join('');
  };
  $('#recProj').onchange = fillTasks; fillTasks();
}
// Preference chips, used by the menu and the tour. type="button" so they do not submit the dialog form.
const prefChip = (key, val, label, on) => `<button type="button" class="chip ${on ? 'active' : ''}" data-pref="${key}" data-val="${val}">${label}</button>`;
const themeChips = () => THEMES.map(([v, l]) => prefChip('theme', v, l, PREFS.theme === v)).join('');
const accentChips = () => ACCENTS.map(([v, l, c]) => prefChip('accent', v, `<i class="dot" style="background:${c}"></i>${l}`, PREFS.accent === v)).join('');
function bindPrefChips(root) {
  $$('[data-pref]', root).forEach(b => b.onclick = () => {
    setPref(b.dataset.pref, b.dataset.val);
    $$(`[data-pref="${b.dataset.pref}"]`, root).forEach(x => x.classList.toggle('active', x === b));
  });
}
function openMenu() {
  openDialog(`<h2>Menu</h2>
    <div class="field"><label>Theme</label><div class="chip-row">${themeChips()}</div></div>
    <div class="field"><label>Accent</label><div class="chip-row">${accentChips()}</div></div>
    <div class="field"><label>Data</label><div class="menu">
      <button value="export">Export backup (JSON)</button>
      <button value="import">Import backup (merge or replace)</button>
      <button value="newproj">New project</button>
      <button value="newrec">Add record manually</button></div></div>
    <div class="field"><label>Help</label><div class="menu">
      <button value="tour">Guided tour</button>
      <button value="keys">Keyboard shortcuts</button></div></div>
    <div class="actions"><button class="btn" value="cancel">Close</button></div>`,
    async (_fd, action) => {
      if (action === 'export') exportBackup();
      if (action === 'import') $('#importFile').click();
      if (action === 'newproj') setTimeout(() => openProjectDialog(null), 50);
      if (action === 'newrec') setTimeout(() => openRecordDialog(null), 50);
      if (action === 'tour') setTimeout(startTour, 50);
      if (action === 'keys') setTimeout(openShortcuts, 50);
    });
  bindPrefChips(dlg);
}
// Import: Merge keeps what is here and adds or updates rows by id; Replace discards everything first.
// Version 1 backups (archived server, older copies) get new ids on import, so merging the same
// version 1 file twice duplicates its rows.
function openImportDialog(payload) {
  const n = k => Array.isArray(payload?.[k]) ? payload[k].length : 0;
  const when = payload?.exported ? new Date(payload.exported * 1000).toLocaleString() : 'unknown date';
  const v1 = payload?.version === 1;
  openDialog(`<h2>Import backup</h2>
    <p class="muted" style="margin:0 0 8px">${n('projects')} projects, ${n('tasks')} tasks, ${n('records')} records. Exported ${esc(when)}. Version ${esc(String(payload?.version ?? '?'))}.</p>
    <p class="muted" style="margin:0 0 8px;font-size:12px"><b>Merge</b> keeps your current data and adds or updates rows from the file. <b>Replace all</b> deletes current data first.${v1 ? ' This is a version 1 file: its rows get new ids, so merging it a second time would duplicate them.' : ''}</p>
    <div class="actions"><button class="btn" value="cancel">Cancel</button>
      <button class="btn" value="merge">Merge</button>
      <button class="btn primary" value="replace">Replace all</button></div>`,
    async (_fd, action) => {
      await api('POST', action === 'merge' ? 'api/import?mode=merge' : 'api/import', payload);
      S.projectId = null;
      await refresh();
    });
}
$('#importFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  let payload;
  try { payload = JSON.parse(await f.text()); } catch { alert('Not a JSON file.'); e.target.value = ''; return; }
  e.target.value = '';
  openImportDialog(payload);
};

// ---------- ticking sound ----------
// Loops a kitchen-timer recording (static/sounds/kitchen-timer.mp3, Pixabay). Media playback is not
// throttled in hidden tabs, so it keeps going when the user switches away.
// The button is a standing preference (PREFS.tick). Sound plays only while a stopwatch or
// countdown is running; syncTick runs on every render to start or stop it.
const ticker = new Audio('sounds/kitchen-timer.mp3');
ticker.loop = true;
ticker.preload = 'auto';
function syncTick() {
  const want = PREFS.tick && !!S.running;
  if (want && ticker.paused) ticker.play().catch(() => { /* needs a click first; retried on the next render */ });
  if (!want && !ticker.paused) { ticker.pause(); ticker.currentTime = 0; }
  $('#tickBtn').classList.toggle('active', PREFS.tick);
  $('#tickBtn').setAttribute('aria-pressed', String(PREFS.tick));
}
function toggleTick() { setPref('tick', !PREFS.tick); syncTick(); }

// ---------- guided tour ----------
// Cards over the live Projects view, each pointing at one control. Nothing is written to the store:
// with no project or nothing running, the tour puts a demo card or a demo running bar in the DOM
// only, and the next render() removes them. Started from the menu, or from the empty Projects view
// until it has been finished or skipped once (PREFS.tourSeen). It never starts by itself.
const TOUR = [
  { title: 'Welcome', text: 'Welcome to the Tour! Let\'s explore how this app works. Press Esc anytime to stop the tour. You can revisit the Tour from the settings menu.' },
  { target: '.mode-row', title: 'Stopwatch or countdown', text: 'This row sets how the play buttons start. Stopwatch runs until you stop it. Countdown runs for a set number of minutes and ends on its own, even if the page is closed. To give a task its own estimate, end its name with ! and a length, for example "Write intro !25 min". Play on that task then counts down the time left on it.' },
  { target: '.proj .play', title: 'Start a timer', text: 'The play button starts a timer on the project. Starting another timer stops this one. Tap the card to open the project. Each task there has its own play button, and the records are listed below.' },
  { title: 'Tasks', text: 'Inside a project, + Add task adds a task. Paste a Markdown list into the Name field to add one task per line; list markers like "- " and "1. " are dropped. A line can carry a countdown timer too, for example "- Write intro !25 min". Press + Sub on a task row to add a sub-task, up to three levels.' },
  { target: '#runbar', title: 'The running bar', text: 'This bar stays at the bottom of every view while a timer runs. It shows a live clock. The square button stops the timer.', demoRun: true },
  { target: '.tabs', title: 'Four views', text: 'Projects lists your projects. Reports shows totals and charts for a period. Timeline lists records by day; tap a record to edit it. Calendar shows a month with a total for each day.' },
  { target: '#menuBtn', title: 'Backup', text: 'The menu has Export, which saves everything to a JSON file, and Import, which merges a file into your data or replaces it. To use two devices, export on one and import on the other.' },
  { target: '#menuBtn', title: 'Theme', text: 'The theme and the accent color are in the same menu. You can also change them here.', chips: true },
];
let tourStep = -1;  // index into TOUR while the tour is open, otherwise -1
const tourEl = $('#tour');
async function startTour() {
  if (dlg.open) dlg.close();
  S.view = 'projects'; S.projectId = null;
  await render();
  tourStage();
  $('.app').inert = true;
  tourEl.hidden = false;
  showTourStep(0);
  $('#tourNext').focus();
}
function endTour() {
  tourStep = -1;
  tourEl.hidden = true;
  $('.app').inert = false;
  $('#runbar').classList.remove('tour-demo');
  setPref('tourSeen', true);
  render();
  $('#menuBtn').focus();
}
// With no project there is no mode row and no play button to point at: show both with a demo card.
function tourStage() {
  if ($('.proj .play', view)) return;
  view.innerHTML = modeRowHtml() + `<button class="add-card">+ New project</button>` +
    projectCardHtml({ id: 'demo', name: 'Example project', color: PALETTE[0] }, 0).replace('class="proj"', 'class="proj tour-demo"');
}
function showTourStep(i) {
  tourStep = i;
  const st = TOUR[i], bar = $('#runbar');
  tourStage();
  if (st.demoRun && !S.running) {
    bar.hidden = false; bar.classList.add('tour-demo');
    $('#runDot').style.background = PALETTE[0]; $('#runProject').textContent = 'Example project';
    $('#runTask').textContent = 'No task'; $('#runKind').hidden = true; $('#runTime').textContent = '12:34';
  } else if (bar.classList.contains('tour-demo')) { bar.classList.remove('tour-demo'); renderRunbar(); }
  $('#tourStep').textContent = `${i + 1} of ${TOUR.length}`;
  $('#tourTitle').textContent = st.title;
  $('#tourText').textContent = st.text;
  $('#tourExtra').innerHTML = st.chips ? `<div class="chip-row">${themeChips()}</div><div class="chip-row">${accentChips()}</div>` : '';
  bindPrefChips($('#tourExtra'));
  $('#tourBack').disabled = i === 0;
  $('#tourNext').textContent = i === TOUR.length - 1 ? 'Done' : 'Next';
  const t = tourTarget();
  if (t) t.scrollIntoView({ block: 'center' });
  placeTour(t);
}
const tourTarget = () => TOUR[tourStep].target ? $(TOUR[tourStep].target) : null;
// Cut a hole around the target and put the card under it, or above it when there is no room below.
function placeTour(t) {
  const hole = $('.tour-hole', tourEl), card = $('.tour-card', tourEl), pad = 6, gap = 12;
  hole.hidden = !t;
  tourEl.classList.toggle('dim', !t);
  const cw = card.offsetWidth, ch = card.offsetHeight;
  let top, left;
  if (t) {
    const r = t.getBoundingClientRect();
    Object.assign(hole.style, { top: `${r.top - pad}px`, left: `${r.left - pad}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px` });
    top = r.bottom + pad + gap + ch <= innerHeight - gap ? r.bottom + pad + gap : Math.max(gap, r.top - pad - gap - ch);
    left = Math.min(Math.max(gap, r.left + r.width / 2 - cw / 2), innerWidth - cw - gap);
  } else {
    top = Math.max(gap, (innerHeight - ch) / 2); left = Math.max(gap, (innerWidth - cw) / 2);
  }
  Object.assign(card.style, { top: `${top}px`, left: `${left}px` });
}
function tourNav(d) {
  const i = tourStep + d;
  if (i >= TOUR.length) endTour(); else if (i >= 0) showTourStep(i);
}
$('#tourNext').onclick = () => tourNav(1);
$('#tourBack').onclick = () => tourNav(-1);
$('#tourSkip').onclick = endTour;
document.addEventListener('keydown', e => {
  if (tourStep < 0) return;
  if (e.key === 'Escape') endTour();
  else if (e.key === 'ArrowRight') tourNav(1);
  else if (e.key === 'ArrowLeft') tourNav(-1);
});
const replaceTour = () => { if (tourStep >= 0) placeTour(tourTarget()); };
addEventListener('resize', replaceTour);
addEventListener('scroll', replaceTour, { passive: true });

// ---------- keyboard shortcuts ----------
// Single keys with no modifier, ignored while typing in a field, while a dialog is open, and
// during the tour. "?" opens the list; the same list is in the menu under Help.
const SHORTCUTS = [
  ['?', 'This list'],
  ['1 2 3 4', 'Projects, Reports, Timeline, Calendar'],
  ['N', 'New project'],
  ['A', 'Add a task to the open project'],
  ['R', 'Add a record'],
  ['S', 'Stop the timer. If none runs, start one on the open project, or else on the last tracked project'],
  ['M', 'Switch between stopwatch and countdown'],
  ['\u2190 \u2192', 'Previous and next month in Calendar'],
  [',', 'Menu'],
  ['Esc', 'Close a dialog, or back to the project list'],
];
function openShortcuts() {
  openDialog(`<h2>Keyboard shortcuts</h2>
    <div class="keys">${SHORTCUTS.map(([k, what]) => `<kbd>${esc(k)}</kbd><span>${esc(what)}</span>`).join('')}</div>
    <div class="actions"><button class="btn" value="cancel">Close</button></div>`, async () => {});
  dlg.dataset.kind = 'keys';
}
// S: stop what runs; otherwise start the open project, or the project of the most recent record.
async function toggleTimerKey() {
  if (S.running) return stopTimer();
  let pid = S.view === 'projects' ? S.projectId : null;
  if (!pid) { const recs = await fetchRecords(0, now() + 1); pid = recs.sort((a, b) => b.start - a.start)[0]?.project_id ?? null; }
  if (pid && proj(pid)) return startTimer(pid);
}
document.addEventListener('keydown', e => {
  if (tourStep >= 0 || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable) return;
  if (dlg.open) { if (e.key === '?' && dlg.dataset.kind === 'keys') { e.preventDefault(); dlg.close(); } return; }
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const views = { 1: 'projects', 2: 'reports', 3: 'timeline', 4: 'calendar' };
  const actions = {
    '?': openShortcuts, ',': openMenu,
    n: () => openProjectDialog(null),
    a: () => { if (S.view === 'projects' && S.projectId) openTaskDialog(null, S.projectId); },
    r: () => openRecordDialog(null),
    s: toggleTimerKey,
    m: () => { const m = PREFS.mode === 'countdown' ? 'stopwatch' : 'countdown'; const b = $(`[data-start-mode="${m}"]`, view); if (b) b.click(); else setPref('mode', m); },
    ArrowLeft: () => { if (S.view === 'calendar') $('#prevM').click(); },
    ArrowRight: () => { if (S.view === 'calendar') $('#nextM').click(); },
    Escape: () => { if (S.view === 'projects' && S.projectId) { S.projectId = null; render(); } },
  };
  const fn = views[k] ? () => setView(views[k]) : actions[k];
  if (!fn) return;
  e.preventDefault();
  fn();
});

// ---------- wiring ----------
$('#tickBtn').onclick = toggleTick;
$$('.tabs button').forEach(b => b.onclick = () => setView(b.dataset.view));
$('#backBtn').onclick = () => { S.projectId = null; render(); };
$('#stopBtn').onclick = stopTimer;
$('#undoBtn').onclick = undoDelete;
$('#menuBtn').onclick = openMenu;
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
// Another tab of the app wrote to localStorage: show its change here.
addEventListener('storage', e => { if (e.key === ProductivityStore.KEY) refresh(); });

(async function start() {
  await refresh();
  // Caches the shell for offline use and makes the page installable.
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
