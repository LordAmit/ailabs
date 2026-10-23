// Node tests for the browser-side store. Run: node --test tests/store.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createStore, KEY, VERSION } = require('../store.js');

const memStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const fresh = () => createStore(memStorage());
const expectStatus = (fn, status) => { try { fn(); assert.fail('expected an error'); } catch (e) { assert.equal(e.status, status, e.message); } };
const isUuid = s => typeof s === 'string' && /^[0-9a-f-]{36}$/.test(s);

test('empty state', () => {
  const s = fresh();
  const st = s.request('GET', 'api/state');
  assert.deepEqual(st.projects, []); assert.deepEqual(st.tasks, []); assert.equal(st.running, null);
});

test('ids are uuid strings', () => {
  const s = fresh();
  const a = s.request('POST', 'api/projects', { name: 'A' }), b = s.request('POST', 'api/projects', { name: 'B' });
  assert.ok(isUuid(a.id) && isUuid(b.id) && a.id !== b.id);
});

test('project crud and cascade', () => {
  const s = fresh();
  expectStatus(() => s.request('POST', 'api/projects', { name: '  ' }), 400);
  const p = s.request('POST', 'api/projects', { name: 'A' });
  const t = s.request('POST', 'api/tasks', { name: 't', project_id: p.id });
  s.request('POST', 'api/records', { project_id: p.id, task_id: t.id, start: 100, end: 200 });
  const up = s.request('PUT', `api/projects/${p.id}`, { name: 'B', archived: true });
  assert.equal(up.name, 'B'); assert.equal(up.archived, 1);
  expectStatus(() => s.request('PUT', 'api/projects/nope', { name: 'x' }), 404);
  s.request('DELETE', `api/projects/${p.id}`);
  const st = s.request('GET', 'api/state');
  assert.deepEqual(st.projects, []); assert.deepEqual(st.tasks, []);
  assert.deepEqual(s.request('GET', 'api/records'), []);
});

test('task delete sets record task_id to null', () => {
  const s = fresh();
  const p = s.request('POST', 'api/projects', { name: 'A' });
  const t = s.request('POST', 'api/tasks', { name: 't', project_id: p.id });
  const r = s.request('POST', 'api/records', { project_id: p.id, task_id: t.id, start: 1, end: 2 });
  s.request('DELETE', `api/tasks/${t.id}`);
  assert.equal(s.request('GET', 'api/records')[0].task_id, null);
  assert.equal(r.task_id, t.id, 'returned objects are copies');
});

test('validation matches the archived server', () => {
  const s = fresh();
  const a = s.request('POST', 'api/projects', { name: 'a' }), b = s.request('POST', 'api/projects', { name: 'b' });
  const tb = s.request('POST', 'api/tasks', { name: 't', project_id: b.id });
  expectStatus(() => s.request('POST', 'api/tasks', { name: 't', project_id: 'nope' }), 404);
  expectStatus(() => s.request('POST', 'api/records', { project_id: 'nope', start: 1, end: 2 }), 404);
  expectStatus(() => s.request('POST', 'api/records', { project_id: a.id, task_id: tb.id, start: 1, end: 2 }), 400);
  expectStatus(() => s.request('POST', 'api/records', { project_id: a.id, start: 5, end: 5 }), 400);
  const r = s.request('POST', 'api/records', { project_id: a.id, start: 1, end: 2 });
  expectStatus(() => s.request('PUT', `api/records/${r.id}`, { project_id: 'nope' }), 404);
  expectStatus(() => s.request('PUT', `api/records/${r.id}`, { task_id: tb.id }), 400);
  expectStatus(() => s.request('PUT', `api/records/${r.id}`, { end: 1 }), 400);
  expectStatus(() => s.request('POST', 'api/timer/start', {}), 400);
  expectStatus(() => s.request('POST', 'api/timer/start', { project_id: 'nope' }), 404);
});

test('timer start replaces running, stop ends it and drops zero-length', () => {
  const s = fresh();
  const a = s.request('POST', 'api/projects', { name: 'a' }), b = s.request('POST', 'api/projects', { name: 'b' });
  const r1 = s.request('POST', 'api/timer/start', { project_id: a.id });
  const r2 = s.request('POST', 'api/timer/start', { project_id: b.id });
  assert.equal(s.request('GET', 'api/state').running.id, r2.id);
  const ended = s.request('GET', 'api/records').find(r => r.id === r1.id);
  assert.ok(ended == null || ended.end != null, 'the first record is ended or already dropped');
  s.request('POST', 'api/timer/stop');
  assert.equal(s.request('GET', 'api/state').running, null);
  // Whether a record survives depends on the clock second it fell in; what must hold is that none is zero-length.
  assert.ok(s.request('GET', 'api/records').every(r => r.end > r.start), 'zero-length records are dropped');
});

test('records range query', () => {
  const s = fresh();
  const p = s.request('POST', 'api/projects', { name: 'a' });
  s.request('POST', 'api/records', { project_id: p.id, start: 100, end: 200 });
  const b = s.request('POST', 'api/records', { project_id: p.id, start: 300, end: 400 });
  assert.deepEqual(s.request('GET', 'api/records?from=250&to=500').map(r => r.id), [b.id]);
});

// --- backups ---

const seed = s => {
  const p = s.request('POST', 'api/projects', { name: 'seed' });
  s.request('POST', 'api/records', { project_id: p.id, start: 100, end: 200 });
  return p;
};
const snapshot = s => ({ state: s.request('GET', 'api/state'), records: s.request('GET', 'api/records') });
const stripNow = x => { delete x.state.now; return x; };

test('export is version 2 and round trips by replace', () => {
  const s = fresh(); seed(s);
  const dump = s.request('GET', 'api/export');
  assert.equal(dump.version, VERSION);
  const s2 = fresh();
  s2.request('POST', 'api/import', dump);
  assert.deepEqual(stripNow(snapshot(s2)), stripNow(snapshot(s)));
});

test('import validation keeps existing data', () => {
  const s = fresh(); seed(s);
  const before = stripNow(snapshot(s));
  expectStatus(() => s.request('POST', 'api/import', {}), 400);
  expectStatus(() => s.request('POST', 'api/import', { version: 3, projects: [], tasks: [], records: [] }), 400);
  expectStatus(() => s.request('POST', 'api/import', { version: 2, projects: [], tasks: [] }), 400);
  expectStatus(() => s.request('POST', 'api/import', { version: 2, projects: [{ id: 'x' }], tasks: [], records: [] }), 400);
  expectStatus(() => s.request('POST', 'api/import', { version: 2, projects: [{ id: 1, name: 'int id' }], tasks: [], records: [] }), 400);
  expectStatus(() => s.request('POST', 'api/import?mode=merge', { version: 2, projects: [], tasks: [], records: [{ id: 'r', project_id: 'missing', start: 1, end: 2 }] }), 400);
  assert.deepEqual(stripNow(snapshot(s)), before);
});

test('version 1 backup (integer ids) imports with fresh ids and intact references', () => {
  const s = fresh();
  const v1 = { version: 1, projects: [{ id: 1, name: 'p' }], tasks: [{ id: 7, project_id: 1, name: 't' }], records: [{ id: 3, project_id: 1, task_id: 7, start: 1, end: 2 }] };
  s.request('POST', 'api/import', v1);
  const st = s.request('GET', 'api/state'), rec = s.request('GET', 'api/records')[0];
  assert.ok(isUuid(st.projects[0].id) && isUuid(st.tasks[0].id) && isUuid(rec.id));
  assert.equal(st.tasks[0].project_id, st.projects[0].id);
  assert.equal(rec.project_id, st.projects[0].id);
  assert.equal(rec.task_id, st.tasks[0].id);
  assert.equal(rec.planned_end, null, 'missing planned_end becomes null');
  expectStatus(() => s.request('POST', 'api/import', { version: 1, projects: [], tasks: [{ id: 1, project_id: 9, name: 't' }], records: [] }), 400);
});

test('merge adds new rows and the file wins on a shared id', () => {
  const a = fresh(), b = fresh();
  const pa = seed(a);
  const pb = b.request('POST', 'api/projects', { name: 'phone' });
  b.request('POST', 'api/records', { project_id: pb.id, start: 300, end: 400 });
  // b also has a's project in an older state, renamed
  b.request('POST', 'api/import?mode=merge', { version: 2, projects: [{ ...pa, name: 'renamed on phone' }], tasks: [], records: [] });
  const dump = b.request('GET', 'api/export');
  const res = a.request('POST', 'api/import?mode=merge', dump);
  assert.equal(res.mode, 'merge');
  const st = a.request('GET', 'api/state');
  assert.equal(st.projects.length, 2);
  assert.equal(st.projects.find(p => p.id === pa.id).name, 'renamed on phone');
  assert.equal(a.request('GET', 'api/records').length, 2);
});

test('merging the same file twice does not duplicate', () => {
  const a = fresh(); seed(a);
  const dump = a.request('GET', 'api/export');
  const b = fresh(); seed(b);
  b.request('POST', 'api/import?mode=merge', dump);
  b.request('POST', 'api/import?mode=merge', dump);
  assert.equal(b.request('GET', 'api/state').projects.length, 2);
  assert.equal(b.request('GET', 'api/records').length, 2);
});

test('merge with two running records keeps the newest', () => {
  const a = fresh(), b = fresh();
  const pa = a.request('POST', 'api/projects', { name: 'a' });
  const ra = a.request('POST', 'api/timer/start', { project_id: pa.id });
  a.request('PUT', `api/records/${ra.id}`, { start: ra.start - 500 });
  const pb = b.request('POST', 'api/projects', { name: 'b' });
  b.request('POST', 'api/timer/start', { project_id: pb.id });
  a.request('POST', 'api/import?mode=merge', b.request('GET', 'api/export'));
  const live = a.request('GET', 'api/records').filter(r => r.end == null);
  assert.equal(live.length, 1);
  assert.equal(live[0].project_id, pb.id, 'the later start stays running');
  const old = a.request('GET', 'api/records').find(r => r.id === ra.id);
  assert.ok(old.end != null && old.end > old.start);
});

test('version 1 data already in storage migrates to uuid ids on load', () => {
  const storage = memStorage();
  storage.setItem(KEY, JSON.stringify({ version: 1, projects: [{ id: 1, name: 'old', color: '#000', archived: 0, created: 1 }], tasks: [], records: [{ id: 1, project_id: 1, task_id: null, start: 1, end: 2 }], seq: { projects: 1, tasks: 0, records: 1 } }));
  const s = createStore(storage);
  const st = s.request('GET', 'api/state');
  assert.ok(isUuid(st.projects[0].id));
  assert.equal(s.request('GET', 'api/records')[0].project_id, st.projects[0].id);
  assert.equal(JSON.parse(storage.getItem(KEY)).version, VERSION, 'migrated data is saved');
});

// --- countdown ---

test('countdown start sets planned_end, bad minutes rejected', () => {
  const s = fresh();
  const p = s.request('POST', 'api/projects', { name: 'a' });
  expectStatus(() => s.request('POST', 'api/timer/start', { project_id: p.id, minutes: 0 }), 400);
  expectStatus(() => s.request('POST', 'api/timer/start', { project_id: p.id, minutes: 999 }), 400);
  expectStatus(() => s.request('POST', 'api/timer/start', { project_id: p.id, minutes: 'x' }), 400);
  const r = s.request('POST', 'api/timer/start', { project_id: p.id, minutes: 1 });
  assert.equal(r.planned_end, r.start + 60);
  const sw = s.request('POST', 'api/timer/start', { project_id: p.id });
  assert.equal(sw.planned_end, null, 'stopwatch has no planned end');
});

test('expired countdown closes at planned_end on the next request', () => {
  const s = fresh();
  const p = s.request('POST', 'api/projects', { name: 'a' });
  const r = s.request('POST', 'api/timer/start', { project_id: p.id, minutes: 25 });
  const past = Math.floor(Date.now() / 1000) - 10;
  s.request('PUT', `api/records/${r.id}`, { start: past - 60, planned_end: past });
  assert.equal(s.request('GET', 'api/state').running, null);
  assert.equal(s.request('GET', 'api/records').find(x => x.id === r.id).end, past);
});

test('countdown stopped early ends at stop time', () => {
  const s = fresh();
  const p = s.request('POST', 'api/projects', { name: 'a' });
  const r = s.request('POST', 'api/timer/start', { project_id: p.id, minutes: 25 });
  s.request('PUT', `api/records/${r.id}`, { start: r.start - 100 });
  s.request('POST', 'api/timer/stop');
  const rec = s.request('GET', 'api/records').find(x => x.id === r.id);
  assert.ok(rec.end < rec.planned_end && rec.end > rec.start);
});

test('a new start ends a running countdown now, not at planned_end', () => {
  const s = fresh();
  const p = s.request('POST', 'api/projects', { name: 'a' });
  const r = s.request('POST', 'api/timer/start', { project_id: p.id, minutes: 25 });
  s.request('PUT', `api/records/${r.id}`, { start: r.start - 100 });
  s.request('POST', 'api/timer/start', { project_id: p.id });
  assert.ok(s.request('GET', 'api/records').find(x => x.id === r.id).end < r.planned_end);
});

test('data persists through storage', () => {
  const storage = memStorage();
  createStore(storage).request('POST', 'api/projects', { name: 'kept' });
  assert.equal(createStore(storage).request('GET', 'api/state').projects[0].name, 'kept');
});

test('two stores over one storage see each other and a read never overwrites a write', () => {
  const m = new Map(); let writes = 0;
  const storage = { getItem: k => m.get(k) ?? null, setItem: (k, v) => { writes++; m.set(k, v); } };
  const a = createStore(storage), b = createStore(storage);
  a.request('GET', 'api/state');  // a now holds an in-memory copy of the empty data
  const fromB = b.request('POST', 'api/projects', { name: 'from B' });
  const before = writes;
  assert.equal(a.request('GET', 'api/state').projects[0].id, fromB.id);  // a sees b's write
  assert.equal(writes, before);  // and the read wrote nothing
  assert.ok(storage.getItem(KEY).includes(fromB.id));
  a.request('POST', 'api/projects', { name: 'from A' });
  assert.deepEqual(b.request('GET', 'api/state').projects.map(p => p.name), ['from A', 'from B']);
});

// --- sub-tasks: parent_id, at most three levels, subtree delete, import checks ---
const tree = s => {
  const p = s.request('POST', 'api/projects', { name: 'P' });
  const a = s.request('POST', 'api/tasks', { name: 'a', project_id: p.id });
  const b = s.request('POST', 'api/tasks', { name: 'b', project_id: p.id, parent_id: a.id });
  const c = s.request('POST', 'api/tasks', { name: 'c', project_id: p.id, parent_id: b.id });
  return { p, a, b, c };
};

test('task with a parent in the same project, parent_id null by default', () => {
  const s = fresh();
  const { a, b } = tree(s);
  assert.equal(a.parent_id, null); assert.equal(b.parent_id, a.id);
  assert.equal(s.request('GET', 'api/state').tasks.find(t => t.id === b.id).parent_id, a.id);
});

test('a fourth level is rejected', () => {
  const s = fresh();
  const { p, c } = tree(s);
  expectStatus(() => s.request('POST', 'api/tasks', { name: 'd', project_id: p.id, parent_id: c.id }), 400);
});

test('parent must exist and belong to the same project', () => {
  const s = fresh();
  const { a } = tree(s);
  const q = s.request('POST', 'api/projects', { name: 'Q' });
  expectStatus(() => s.request('POST', 'api/tasks', { name: 'x', project_id: q.id, parent_id: a.id }), 400);
  expectStatus(() => s.request('POST', 'api/tasks', { name: 'x', project_id: q.id, parent_id: 'nope' }), 400);
});

test('deleting a task deletes its subtree and unlinks their records', () => {
  const s = fresh();
  const { p, a, b, c } = tree(s);
  const keep = s.request('POST', 'api/tasks', { name: 'keep', project_id: p.id });
  s.request('POST', 'api/records', { project_id: p.id, task_id: c.id, start: 100, end: 200 });
  s.request('DELETE', `api/tasks/${a.id}`);
  assert.deepEqual(s.request('GET', 'api/state').tasks.map(t => t.id), [keep.id]);
  assert.equal(s.request('GET', 'api/records')[0].task_id, null);
  assert.ok(![a, b, c].some(t => s.request('GET', 'api/state').tasks.find(x => x.id === t.id)));
});

test('export carries parent_id and a backup without it imports as top-level tasks', () => {
  const s = fresh();
  const { b } = tree(s);
  const dump = s.request('GET', 'api/export');
  assert.equal(dump.tasks.find(t => t.id === b.id).parent_id, b.parent_id);
  const s2 = fresh();
  s2.request('POST', 'api/import', dump);
  assert.equal(s2.request('GET', 'api/state').tasks.find(t => t.id === b.id).parent_id, b.parent_id);
  const old = { ...dump, tasks: dump.tasks.map(({ parent_id, ...t }) => t) };
  const s3 = fresh();
  s3.request('POST', 'api/import', old);
  assert.ok(s3.request('GET', 'api/state').tasks.every(t => t.parent_id === null));
});

test('import rejects a parent that is missing, in another project, or too deep', () => {
  const s = fresh();
  const { p } = tree(s);
  const good = s.request('GET', 'api/export');
  const bad = (edit) => { const d = JSON.parse(JSON.stringify(good)); edit(d); expectStatus(() => fresh().request('POST', 'api/import', d), 400); };
  bad(d => { d.tasks[1].parent_id = 'nope'; });
  bad(d => { d.projects.push({ id: 'q', name: 'Q' }); d.tasks[1].project_id = 'q'; });
  bad(d => { d.tasks.push({ id: 'd', project_id: p.id, name: 'd', parent_id: d.tasks[2].id }); });
  bad(d => { d.tasks[0].parent_id = d.tasks[2].id; });  // cycle
  assert.equal(fresh().request('POST', 'api/import', good).ok, true);
});

test('merging a snapshot taken before a delete restores the rows by id (undo)', () => {
  const s = fresh();
  const { p, a, b, c } = tree(s);
  const r = s.request('POST', 'api/records', { project_id: p.id, task_id: c.id, start: 100, end: 200 });
  const snapshot = { version: 2, projects: [], tasks: [a, b, c], records: [r] };
  s.request('DELETE', `api/tasks/${a.id}`);
  assert.equal(s.request('GET', 'api/state').tasks.length, 0);
  s.request('POST', 'api/import?mode=merge', snapshot);
  assert.deepEqual(s.request('GET', 'api/state').tasks.map(t => t.id).sort(), [a.id, b.id, c.id].sort());
  assert.equal(s.request('GET', 'api/records')[0].task_id, c.id);
  s.request('DELETE', `api/projects/${p.id}`);
  s.request('POST', 'api/import?mode=merge', { version: 2, projects: [p], tasks: [a, b, c], records: [r] });
  assert.equal(s.request('GET', 'api/state').projects[0].id, p.id);
  assert.equal(s.request('GET', 'api/records').length, 1);
});

// --- task estimates ---

test('parseTaskLine splits "name !length" into name and minutes', () => {
  const { parseTaskLine } = require('../store.js');
  const cases = [
    ['do blah !15 min', 15], ['do blah!15min', 15], ['do blah !15m', 15], ['do blah !15 mins', 15], ['do blah !15 minutes', 15],
    ['do blah !1h', 60], ['do blah !1 hr', 60], ['do blah !2 hours', 120], ['do blah !1h30m', 90], ['do blah !1h 30 min', 90],
    ['do blah !1:30', 90], ['do blah !90', 90], ['do blah ! 25 MIN ', 25], ['do blah !720', 720],
  ];
  for (const [text, minutes] of cases) assert.deepEqual(parseTaskLine(text), { name: 'do blah', estimate: minutes }, text);
});

test('parseTaskLine leaves text without a valid length as the name', () => {
  const { parseTaskLine } = require('../store.js');
  for (const text of ['name only', 'Ship it!', 'a !b', 'x !0', 'x !721', 'x !2.5', 'x !1h61m', 'x !1:60', 'x !15 days'])
    assert.deepEqual(parseTaskLine(`  ${text}  `), { name: text, estimate: null }, text);
  assert.deepEqual(parseTaskLine('!15'), { name: '!15', estimate: null });
  assert.deepEqual(parseTaskLine(''), { name: '', estimate: null });
});

test('parseTaskLine splits at the last exclamation mark', () => {
  const { parseTaskLine } = require('../store.js');
  assert.deepEqual(parseTaskLine('Ship it! !15 min'), { name: 'Ship it!', estimate: 15 });
  assert.deepEqual(parseTaskLine('Ship it! now'), { name: 'Ship it! now', estimate: null });
});

test('task estimate: create, update, clear, bad values rejected', () => {
  const s = fresh();
  const p = s.request('POST', 'api/projects', { name: 'a' });
  const t = s.request('POST', 'api/tasks', { name: 'x', project_id: p.id, estimate: 15 });
  assert.equal(t.estimate, 15);
  assert.equal(s.request('POST', 'api/tasks', { name: 'y', project_id: p.id }).estimate, null, 'absent means none');
  assert.equal(s.request('PUT', `api/tasks/${t.id}`, { name: 'x2' }).estimate, 15, 'update without the field keeps it');
  assert.equal(s.request('PUT', `api/tasks/${t.id}`, { estimate: 25 }).estimate, 25);
  assert.equal(s.request('PUT', `api/tasks/${t.id}`, { estimate: null }).estimate, null, 'null clears');
  for (const bad of [0, 721, 2.5, 'abc'])
    for (const [m, path] of [['POST', 'api/tasks'], ['PUT', `api/tasks/${t.id}`]])
      expectStatus(() => s.request(m, path, { name: 'z', project_id: p.id, estimate: bad }), 400);
});

test('estimate survives export and import; old data and backups read as null', () => {
  const s = fresh();
  const p = s.request('POST', 'api/projects', { name: 'a' });
  const t = s.request('POST', 'api/tasks', { name: 'x', project_id: p.id, estimate: 15 });
  const dump = s.request('GET', 'api/export');
  assert.equal(dump.tasks[0].estimate, 15);
  const s2 = fresh(); s2.request('POST', 'api/import', dump);
  assert.equal(s2.request('GET', 'api/state').tasks[0].estimate, 15, 'replace keeps it');
  const s3 = fresh(); s3.request('POST', 'api/import?mode=merge', dump);
  assert.equal(s3.request('GET', 'api/state').tasks[0].estimate, 15, 'merge keeps it');
  delete dump.tasks[0].estimate;
  const s4 = fresh(); s4.request('POST', 'api/import', dump);
  assert.equal(s4.request('GET', 'api/state').tasks[0].estimate, null, 'backup without the field');
  dump.tasks[0].estimate = 900;
  expectStatus(() => fresh().request('POST', 'api/import', dump), 400);
  const st = memStorage();
  st.setItem(KEY, JSON.stringify({ version: VERSION, projects: [{ id: 'p', name: 'a', color: '#000', archived: 0, created: 1 }],
    tasks: [{ id: 't', project_id: 'p', parent_id: null, name: 'x', completed: 0, created: 1 }], records: [] }));
  assert.equal(createStore(st).request('GET', 'api/state').tasks[0].estimate, null, 'stored before estimates existed');
  void t;
});

test('start on a task with an estimate counts down what is left, ignoring minutes', () => {
  const s = fresh();
  const p = s.request('POST', 'api/projects', { name: 'a' });
  const t = s.request('POST', 'api/tasks', { name: 'x', project_id: p.id, estimate: 15 });
  const sub = s.request('POST', 'api/tasks', { name: 'sub', project_id: p.id, parent_id: t.id });
  const t0 = Math.floor(Date.now() / 1000) - 86400;
  s.request('POST', 'api/records', { project_id: p.id, task_id: t.id, start: t0, end: t0 + 300 });
  s.request('POST', 'api/records', { project_id: p.id, task_id: sub.id, start: t0 + 1000, end: t0 + 1600 });  // sub-task: does not count
  s.request('POST', 'api/records', { project_id: p.id, task_id: null, start: t0 + 2000, end: t0 + 2600 });  // project only: does not count
  let r = s.request('POST', 'api/timer/start', { project_id: p.id, task_id: t.id, minutes: 60 });
  assert.equal(r.planned_end, r.start + 600, '15 min estimate minus 5 tracked, minutes ignored');
  s.request('PUT', `api/records/${r.id}`, { start: r.start - 700, end: r.start - 100, planned_end: null });  // pretend 10 more minutes passed
  r = s.request('POST', 'api/timer/start', { project_id: p.id, task_id: t.id });
  assert.equal(r.planned_end, null, 'estimate used up: stopwatch');
  s.request('POST', 'api/timer/stop');
  const plain = s.request('POST', 'api/timer/start', { project_id: p.id, task_id: sub.id, minutes: 3 });
  assert.equal(plain.planned_end, plain.start + 180, 'a task without an estimate still honours minutes');
});

test('remaining time is in seconds and a running record on the task does not count twice', () => {
  const s = fresh();
  const p = s.request('POST', 'api/projects', { name: 'a' });
  const t = s.request('POST', 'api/tasks', { name: 'x', project_id: p.id, estimate: 1 });
  const t0 = Math.floor(Date.now() / 1000) - 86400;
  s.request('POST', 'api/records', { project_id: p.id, task_id: t.id, start: t0, end: t0 + 45 });
  const r = s.request('POST', 'api/timer/start', { project_id: p.id, task_id: t.id });
  assert.equal(r.planned_end, r.start + 15);
});
