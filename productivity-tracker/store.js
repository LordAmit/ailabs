/* Browser-side data store. Implements the same operations as the archived Flask API over one
   localStorage key, so the app runs with no server. Export and import use a JSON backup format.

   Format version 2: ids are UUID strings, so two copies (phone, desktop) never collide and a
   backup can be merged instead of replacing. Version 1 (integer ids, from the archived server or
   older copies) is accepted on import and migrated on load; its ids are replaced with fresh UUIDs. */
(function (root) {
  'use strict';

  const KEY = 'productivity.data';
  const VERSION = 2;
  const empty = () => ({ version: VERSION, projects: [], tasks: [], records: [] });
  const now = () => Math.floor(Date.now() / 1000);
  const asInt = (v, d = null) => { const n = parseInt(v, 10); return Number.isNaN(n) ? d : n; };
  const asId = v => (typeof v === 'string' && v) ? v : (typeof v === 'number' ? String(v) : null);
  const clone = x => JSON.parse(JSON.stringify(x));
  const fail = (status, message) => { const e = new Error(message); e.status = status; throw e; };
  const byProject = (a, b) => (a.archived - b.archived) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  const byTask = (a, b) => (a.completed - b.completed) || (b.created - a.created);
  const MAX_COUNTDOWN_MINUTES = 720;
  // A task's estimate in minutes: null or absent means none; anything else must be a whole number of minutes a countdown accepts.
  const asEstimate = v => {
    if (v == null) return null;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > MAX_COUNTDOWN_MINUTES) fail(400, `estimate must be a whole number of minutes, 1 to ${MAX_COUNTDOWN_MINUTES}`);
    return v;
  };
  const MAX_TASK_DEPTH = 3;  // a task, a sub-task, a sub-sub-task
  // 1 for a top-level task. Fails on a missing parent or a chain longer than MAX_TASK_DEPTH (which also catches a cycle).
  function taskDepth(tasks, t) {
    let d = 1;
    for (let cur = t; cur.parent_id != null; d++) {
      cur = tasks.find(x => x.id === cur.parent_id) || fail(400, 'parent task not found');
      if (cur.project_id !== t.project_id) fail(400, 'parent task is in another project');
      if (d >= MAX_TASK_DEPTH) fail(400, `tasks nest at most ${MAX_TASK_DEPTH} levels`);
    }
    return d;
  }
  // The task and everything nested under it.
  function subtree(tasks, id) {
    const ids = new Set([id]);
    for (let grew = true; grew;) { grew = false; for (const t of tasks) if (t.parent_id != null && ids.has(t.parent_id) && !ids.has(t.id)) { ids.add(t.id); grew = true; } }
    return ids;
  }
  // Lengths accepted after "!" in a task name: "15", "15 min", "15m", "1h", "1h30m", "1h 30 min", "1:30". Whole numbers only.
  const LENGTH = /^(?:(\d+)\s*(?:h|hr|hrs|hour|hours)(?:\s*(\d+)\s*(?:m|min|mins|minute|minutes))?|(\d+)\s*(?:m|min|mins|minute|minutes)?|(\d+):(\d{1,2}))$/i;
  const lengthMinutes = text => {
    const m = LENGTH.exec(text.trim());
    if (!m) return null;
    const mins = m[1] != null ? +m[1] * 60 + (+m[2] || 0) : m[3] != null ? +m[3] : +m[4] * 60 + +m[5];
    if ((m[2] != null && +m[2] > 59) || (m[5] != null && +m[5] > 59)) return null;
    return mins >= 1 && mins <= MAX_COUNTDOWN_MINUTES ? mins : null;
  };
  // "do blah !15 min" -> { name: 'do blah', estimate: 15 }. Splits at the last "!"; when what follows is not a
  // length, or nothing precedes it, the whole trimmed text is the name and the estimate is null.
  function parseTaskLine(text) {
    const whole = String(text || '').trim();
    const i = whole.lastIndexOf('!');
    if (i > 0) {
      const name = whole.slice(0, i).trim(), estimate = lengthMinutes(whole.slice(i + 1));
      if (name && estimate != null) return { name, estimate };
    }
    return { name: whole, estimate: null };
  }
  const uuid = () => (root.crypto && root.crypto.randomUUID) ? root.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });

  // Give every row a fresh UUID and rewrite the references. Used for version 1 data (stored or imported).
  function reId(projects, tasks, records) {
    const pm = new Map(), tm = new Map();
    const P = projects.map(p => { const id = uuid(); pm.set(String(p.id), id); return { ...p, id }; });
    const T = tasks.map(t => {
      const project_id = pm.get(String(t.project_id)) || fail(400, 'import failed: task references a missing project');
      const id = uuid(); tm.set(String(t.id), id); return { ...t, id, project_id, parent_id: null };
    });
    const R = records.map(r => ({
      ...r, id: uuid(),
      project_id: pm.get(String(r.project_id)) || fail(400, 'import failed: record references a missing project'),
      task_id: r.task_id == null ? null : (tm.get(String(r.task_id)) || fail(400, 'import failed: record references a missing task')),
    }));
    return { projects: P, tasks: T, records: R };
  }

  function createStore(storage) {
    let data = null;    // in-memory copy of the stored data
    let loaded = null;  // the storage string `data` was parsed from or last saved as

    // Re-read storage whenever another tab has written to it since this one last read or saved.
    // Each tab keeps its own in-memory copy; without this check a tab would write its outdated copy
    // back on its next request and undo what the other tab did.
    function load() {
      const raw = storage.getItem(KEY);
      if (data && raw === loaded) return data;
      loaded = raw;
      try { data = JSON.parse(raw) || empty(); } catch { data = empty(); }
      if (data.version !== VERSION) {  // version 1 or earlier: integer ids
        data = { version: VERSION, ...reId(data.projects || [], data.tasks || [], data.records || []) };
        save();
      }
      for (const t of data.tasks) {
        if (!('parent_id' in t)) t.parent_id = null;  // saved before sub-tasks existed
        if (!('estimate' in t)) t.estimate = null;    // saved before estimates existed
      }
      return data;
    }
    // Writes only when something changed, so a read-only request never touches storage.
    const save = () => { const s = JSON.stringify(data); if (s !== loaded) storage.setItem(KEY, s); loaded = s; };
    const find = (table, id) => data[table].find(x => x.id === id) || fail(404, 'not found');
    const running = () => data.records.filter(r => r.end == null).sort((a, b) => b.start - a.start)[0] || null;
    const endRunning = t => { for (const r of data.records) if (r.end == null) r.end = t; };
    // A countdown ends at its planned end even if nobody was watching. Runs before every request.
    const closeExpired = t => { for (const r of data.records) if (r.end == null && r.planned_end != null && r.planned_end <= t) r.end = r.planned_end; };
    function checkProjectTask(pid, tid) {
      if (!data.projects.some(p => p.id === pid)) fail(404, 'project not found');
      if (tid != null && !data.tasks.some(t => t.id === tid && t.project_id === pid)) fail(400, 'task does not belong to project');
    }

    // Validate a backup and return clean tables with string ids. Version 1 gets fresh ids.
    function normalizeImport(b) {
      if (!b || (b.version !== 1 && b.version !== 2)) fail(400, 'import failed: expected a version 1 or 2 backup');
      for (const k of ['projects', 'tasks', 'records']) if (!Array.isArray(b[k])) fail(400, `import failed: '${k}' list missing`);
      const need = (row, keys) => { for (const k of keys) if (row == null || !(k in row)) fail(400, `import failed: missing ${k}`); };
      const t = now();
      const projects = b.projects.map(p => { need(p, ['id', 'name']); return { id: p.id, name: p.name, color: p.color || '#4f8cff', archived: p.archived ? 1 : 0, created: p.created ?? t }; });
      const tasks = b.tasks.map(x => { need(x, ['id', 'project_id', 'name']); return { id: x.id, project_id: x.project_id, parent_id: x.parent_id ?? null, name: x.name, completed: x.completed ? 1 : 0, created: x.created ?? t, estimate: asEstimate(x.estimate) }; });
      const records = b.records.map(r => { need(r, ['id', 'project_id', 'start']); return { id: r.id, project_id: r.project_id, task_id: r.task_id ?? null, start: r.start, end: r.end ?? null, planned_end: r.planned_end ?? null }; });
      if (b.version === 1) return reId(projects, tasks, records);
      for (const row of [...projects, ...tasks, ...records]) if (typeof row.id !== 'string' || !row.id) fail(400, 'import failed: version 2 ids must be strings');
      return { projects, tasks, records };
    }
    // Rows with a known id are replaced by the file's version; new ids are added.
    function mergeInto(target, incoming) {
      for (const table of ['projects', 'tasks', 'records']) {
        const byId = new Map(target[table].map(x => [x.id, x]));
        for (const row of incoming[table]) byId.set(row.id, row);
        target[table] = [...byId.values()];
      }
    }
    // After an import: every reference resolves, and at most one record is running.
    function settle(d) {
      const pids = new Set(d.projects.map(p => p.id)), tids = new Set(d.tasks.map(t => t.id));
      for (const t of d.tasks) if (!pids.has(t.project_id)) fail(400, 'import failed: task references a missing project');
      for (const t of d.tasks) taskDepth(d.tasks, t);  // parent exists, same project, at most three levels, no cycle
      for (const r of d.records) {
        if (!pids.has(r.project_id)) fail(400, 'import failed: record references a missing project');
        if (r.task_id != null && !tids.has(r.task_id)) fail(400, 'import failed: record references a missing task');
      }
      const live = d.records.filter(r => r.end == null).sort((a, b) => b.start - a.start);
      for (const r of live.slice(1)) r.end = Math.max(live[0].start, r.start + 1);
    }

    // Same paths and status codes as the archived server. `b` is the JSON body, `id` the trailing path id, `q` the query.
    const routes = {
      'GET api/state': () => ({ projects: [...data.projects].sort(byProject), tasks: [...data.tasks].sort(byTask), running: running(), now: now() }),

      'POST api/projects': b => {
        const name = (b.name || '').trim();
        if (!name) fail(400, 'name required');
        const p = { id: uuid(), name, color: b.color || '#4f8cff', archived: 0, created: now() };
        data.projects.push(p); return p;
      },
      'PUT api/projects/:id': (b, id) => {
        const p = find('projects', id);
        p.name = (b.name || p.name).trim() || p.name;
        p.color = b.color || p.color;
        p.archived = ('archived' in b ? b.archived : p.archived) ? 1 : 0;
        return p;
      },
      'DELETE api/projects/:id': (_b, id) => {
        data.projects = data.projects.filter(p => p.id !== id);
        data.tasks = data.tasks.filter(t => t.project_id !== id);
        data.records = data.records.filter(r => r.project_id !== id);
        return { ok: true };
      },

      'POST api/tasks': b => {
        const name = (b.name || '').trim(), pid = asId(b.project_id), parent_id = asId(b.parent_id);
        if (!name || pid == null) fail(400, 'name and project_id required');
        checkProjectTask(pid);
        const t = { id: uuid(), project_id: pid, parent_id, name, completed: 0, created: now(), estimate: asEstimate(b.estimate) };
        taskDepth(data.tasks, t);
        data.tasks.push(t); return t;
      },
      'PUT api/tasks/:id': (b, id) => {
        const t = find('tasks', id);
        t.name = (b.name || t.name).trim() || t.name;
        t.completed = ('completed' in b ? b.completed : t.completed) ? 1 : 0;
        if ('estimate' in b) t.estimate = asEstimate(b.estimate);
        return t;
      },
      'DELETE api/tasks/:id': (_b, id) => {
        const gone = subtree(data.tasks, id);
        data.tasks = data.tasks.filter(t => !gone.has(t.id));
        for (const r of data.records) if (gone.has(r.task_id)) r.task_id = null;
        return { ok: true };
      },

      'POST api/timer/start': b => {
        const pid = asId(b.project_id), tid = asId(b.task_id);
        if (pid == null) fail(400, 'project_id required');
        let minutes = null;  // countdown; absent means stopwatch
        if (b.minutes != null) {
          minutes = asInt(b.minutes);
          if (minutes == null || minutes < 1 || minutes > MAX_COUNTDOWN_MINUTES) fail(400, `minutes must be 1 to ${MAX_COUNTDOWN_MINUTES}`);
        }
        checkProjectTask(pid, tid);
        const t = now(); endRunning(t);
        let planned_end = minutes ? t + minutes * 60 : null;
        // A task with an estimate counts down what is left of it, whatever the caller asked for. Only the task's own
        // ended records count, not its sub-tasks'. Nothing left: a stopwatch.
        const estimate = tid != null ? data.tasks.find(x => x.id === tid).estimate : null;
        if (estimate != null) {
          const tracked = data.records.filter(r => r.task_id === tid && r.end != null).reduce((a, r) => a + (r.end - r.start), 0);
          const left = estimate * 60 - tracked;
          planned_end = left > 0 ? t + left : null;
        }
        const r = { id: uuid(), project_id: pid, task_id: tid, start: t, end: null, planned_end };
        data.records.push(r); return r;
      },
      'POST api/timer/stop': () => {
        const t = now(); endRunning(t);
        data.records = data.records.filter(r => !(r.end != null && r.end <= r.start));
        return { ok: true, now: t };
      },

      'GET api/records': (_b, _id, q) => {
        const f = asInt(q.from, 0), t = asInt(q.to, now() + 86400);
        return data.records.filter(r => r.start < t && (r.end == null || r.end > f)).sort((a, b) => b.start - a.start);
      },
      'POST api/records': b => {
        const pid = asId(b.project_id), tid = asId(b.task_id), start = asInt(b.start), end = asInt(b.end);
        if (pid == null || start == null || end == null || end <= start) fail(400, 'project_id, start, end required and end > start');
        checkProjectTask(pid, tid);
        const r = { id: uuid(), project_id: pid, task_id: tid, start, end, planned_end: null };
        data.records.push(r); return r;
      },
      'PUT api/records/:id': (b, id) => {
        const r = find('records', id);
        const pid = 'project_id' in b ? asId(b.project_id) : r.project_id;
        const tid = 'task_id' in b ? asId(b.task_id) : r.task_id;
        const start = asInt(b.start, r.start);
        const end = 'end' in b ? asInt(b.end) : r.end;
        const planned_end = 'planned_end' in b ? asInt(b.planned_end) : (r.planned_end ?? null);
        if (pid == null) fail(400, 'project_id required');
        if (end != null && end <= start) fail(400, 'end must be after start');
        checkProjectTask(pid, tid);
        Object.assign(r, { project_id: pid, task_id: tid, start, end, planned_end });
        return r;
      },
      'DELETE api/records/:id': (_b, id) => { data.records = data.records.filter(r => r.id !== id); return { ok: true }; },

      'GET api/export': () => ({ version: VERSION, exported: now(), projects: data.projects, tasks: data.tasks, records: data.records }),
      // ?mode=merge keeps local rows and adds or replaces by id; default replaces everything.
      'POST api/import': (b, _id, q) => {
        const incoming = normalizeImport(b);
        const merge = q.mode === 'merge';
        const next = merge ? clone(data) : empty();
        mergeInto(next, incoming);
        settle(next);
        data = next;
        return { ok: true, mode: merge ? 'merge' : 'replace' };
      },
    };

    // request('PUT', 'api/records/<id>?x=1', {...}) -> routes['PUT api/records/:id']({...}, '<id>', {x:'1'})
    function request(method, url, body) {
      load();
      closeExpired(now());
      const [pathPart, queryPart = ''] = url.replace(/^\.?\//, '').split('?');
      const q = Object.fromEntries(new URLSearchParams(queryPart));
      let key = `${method} ${pathPart}`, id = null;
      if (!routes[key]) {
        const m = pathPart.match(/^(.*)\/([^/]+)$/);
        if (m) { key = `${method} ${m[1]}/:id`; id = decodeURIComponent(m[2]); }
      }
      const route = routes[key] || fail(404, `no route ${method} ${pathPart}`);
      const result = route(body || {}, id, q);
      save();
      return clone(result);
    }

    return { request, reset: () => { data = empty(); save(); } };
  }

  const api = { createStore, parseTaskLine, KEY, VERSION };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ProductivityStore = api;
})(typeof self !== 'undefined' ? self : this);
