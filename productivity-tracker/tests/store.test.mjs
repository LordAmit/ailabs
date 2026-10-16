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
