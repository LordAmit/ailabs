# Spec: Productivity Tracker

A single-user, no-account time tracker for personal use.
It is a static web app at the repository root that runs in the browser,
installs as a PWA, keeps its data in the browser, and is served from
https://daspoi.github.io/productivity/. The original Flask and SQLite backend is archived in
`old.backup.pyserver/` and is not developed further.

The reasons behind choices are in DECISIONS.md. Task status is in tasks/todo.md.

## Objective

User: one person tracking their own working time across a handful of projects.

Success: the user can start and stop a timer on a project or task, see where time went today,
this week and this month, correct mistakes by editing records, and back the data up to a JSON file.

### User stories

1. I can create, rename, recolor, archive and delete projects.
2. I can add optional tasks under a project, rename them, mark them done, delete them.
3. I can start a timer on a project or on a task. Starting a new timer stops the running one. Only one timer runs at a time.
4. I can see the running timer on every screen with a live clock and a stop button.
5. I can see a timeline of records grouped by day with per-day totals, and load earlier days. A record that crosses midnight appears under both days with that day's share.
6. I can add a record by hand, and edit or delete any record, including the running one.
7. I can see reports for this week, last 7 days, this month, last 30 days, and all time: total, active days, average per active day, a daily stacked bar chart by project, a weekly chart for the last 8 weeks, an hour-of-day chart, and a by-project breakdown.
8. I can see a month calendar with a total and project dots per day, and the records of a selected day.
9. I can export all data as JSON and import a JSON backup, which replaces all data. Import accepts only a version 1 backup with all three tables present.
10. The app survives a browser reload and a server restart without losing data.
11. I can switch between light, dark and system theme, and pick an accent color (teal, blue, purple). The choice persists across reloads in this browser.
12. I can toggle a continuous kitchen-timer ticking sound with one button. It plays until I toggle it off, independent of the timer, and keeps going when the tab is in the background. It is off on every page load.
13. Data is stored in this browser. Export writes a JSON backup; Import offers Merge, which combines the file with what is here, or Replace all. Two copies of the app, such as a phone and a desktop, are kept in step by exporting on one and merging on the other. Backups from the archived server (version 1) import too.
14. I can install the app from GitHub Pages as a standalone app on desktop and phone. The installed copy works with no network.
15. I can start a countdown instead of a stopwatch: I pick the length (15, 25, 45, 60 minutes or any number up to 720), every play button then starts a countdown, and the record ends by itself at the planned end, even if the page was closed. A short chime plays if the page is open. I can stop it early. The last length is remembered.
16. The ticking sound is a standing toggle. It plays only while a stopwatch or countdown is running and stops when the record ends.

The app never talks to a server. The archived backend is kept for reference only.

### Out of scope

Accounts, multi-user, sync or merge between the server and browser data (snapshots only), cloud
hosting of the server, notifications, Pomodoro cycle countdowns, billing or hourly rates, native
mobile apps, and any network exposure of the server beyond localhost.

## UI

- The header shows the app name, "Productivity Tracker", as a small label above the current view's title, so the installed app is identifiable without a browser tab.
- Navigation is a tab row under the title, in this order: Projects, Reports, Timeline, Calendar. Projects is the view shown on load. Each tab has an icon and a label.
- Dialog Cancel and Delete buttons always work, even when a required field is empty.
- All icons come from one inline SVG sprite in the page. No icon font, no text glyphs.
- Add actions are labeled buttons placed where the result appears: "+ New project" above the project list, "+ Add task" in project detail, "+ Add record" in Timeline and under the selected Calendar day. There is no floating button.
- The running timer bar is fixed at the bottom of the viewport.
- A mode row above the project list and in project detail: Stopwatch and Countdown chips. When Countdown is active a drawer slides out to the right with the length presets and a minutes field; choosing Stopwatch closes it. The running bar shows an hourglass and the time left, red under one minute.
- Visual style follows getartcraft.com/apps: no rounded corners, 1px hairline borders, inverted (ink on paper, paper on ink) primary buttons, small uppercase monospace labels with wide letter spacing. Fonts: Archivo for headings and large numbers, Inter for body text, Geist Mono for labels and times, Instrument Serif italic for empty states. The fonts ship with the app and are cached by the service worker, so the installed copy looks the same offline.
- Palette: light is ink #101014 on paper #f2f1ee; dark is paper on #121316. Accent default #2d81ff, with teal and purple alternatives. Running state uses a warm orange.

## Tech Stack

| Layer | Choice |
|---|---|
| App | Vanilla JS, plain static files at the repository root, no build step; deployed as is into `productivity/` of the `daspoi.github.io` Pages repository |
| Storage | `store.js`: the data operations over one localStorage key |
| Offline and install | Service worker (network first, cache fallback) and a web app manifest |
| Charts | Inline SVG generated in JS |
| Sound | `sounds/kitchen-timer.mp3`, looped with an HTML audio element |
| Fonts | Archivo, Inter, Geist Mono, Instrument Serif, self-hosted Latin woff2 in `fonts/` (SIL OFL) |
| Archived backend | `old.backup.pyserver/`: Python, Flask, SQLite, pytest; reference only, the app does not call it |

## Commands

```
Dev:    make serve                      # python3 -m http.server 8000
Test:   make test                       # node --test tests/store.test.mjs
Check:  make check                      # node --check on app.js, store.js, sw.js
Deploy: make                            # check, test, rsync app files to ../../daspoi.github.io/productivity, then push there
Lint:   none configured
```

Archived server: see `old.backup.pyserver/README.md`.

## Project Structure

```
index.html            Single page shell, SVG icon sprite, theme bootstrap script, manifest link
app.js                All frontend logic (state, rendering, dialogs, theme, sound, data source switch)
store.js              Browser-side store with the same operations as the API
sw.js                 Service worker: shell cache, API never cached
manifest.webmanifest, icon.svg, icon-192.png, icon-512.png
style.css             Styles; dark and light themes and three accents via tokens
fonts.css, fonts/     Four self-hosted woff2 fonts and the SIL Open Font License
sounds/               kitchen-timer.mp3 (Pixabay, Pixabay Content License)
.nojekyll             GitHub Pages serves the files as they are
Makefile              deploy (default), check, test, serve
README.md             Run, install, data, timers, appearance, tests
SPEC.md               This file
DECISIONS.md          Decision log with alternatives considered
TODO.md               Deferred work
tasks/plan.md         Implementation plan
tasks/todo.md         Task list with acceptance criteria and status
tests/store.test.mjs  Store tests (node --test)
tests/MANUAL.md       Frontend manual checklist
old.backup.pyserver/  Archived Flask server: app.py, requirements, pytest tests, its database, README
```

## Data Model

```
projects: id, name, color, archived 0|1, created epoch
tasks:    id, project_id, name, completed 0|1, created epoch
records:  id, project_id, task_id|null, start epoch, end epoch|null, planned_end epoch|null
```

Ids are UUID strings, so rows made on different devices never collide. Stored as one JSON object
under the localStorage key `productivity.data` with `version: 2`. Deleting a project removes its
tasks and records; deleting a task sets `task_id` to null on its records. A record with
`end == null` is the running timer; `planned_end` is set for countdowns. All times are Unix
seconds, UTC. The frontend converts to local time for display and splits records at local midnight
for day totals.

The backup file is the same three lists plus `version: 2` and `exported`. Version 1 backups
(integer ids, from the archived server or older copies) are accepted on import and on load; their
rows get fresh UUIDs with references rewritten.

Import has two modes. Replace discards local data first. Merge keeps local rows, adds rows whose
id is new, and overwrites rows whose id already exists with the file's version. After either, every
reference must resolve or the import is rejected and nothing changes, and if more than one record
is running only the one with the latest start stays open.

## Operations

`store.js` exposes `request(method, path, body)` with these paths. They are the routes of the
archived server, kept as the shape of the operations and so its tests still mirror the old ones.

| Method and path | Purpose |
|---|---|
| GET /api/state | projects, tasks, running record, server time |
| POST, PUT, DELETE /api/projects[/id] | project CRUD |
| POST, PUT, DELETE /api/tasks[/id] | task CRUD |
| POST /api/timer/start | ends any running record, starts a new one |
| POST /api/timer/stop | ends the running record, deletes zero-length records |
| GET /api/records?from=&to= | records overlapping the half-open range |
| POST, PUT, DELETE /api/records[/id] | manual record CRUD |
| GET /api/export | JSON download of all tables, filename `productivity-backup.json` |
| POST /api/import | replaces all tables from a version 1 backup |

Errors carry a status: 400 for a missing or malformed field, 404 for an unknown project or record,
400 for a task that does not belong to the given project.

`POST api/timer/start` takes optional `minutes` (1 to 720) and sets `planned_end`. Before every
request the store closes any running record whose `planned_end` has passed, with
`end = planned_end`. `PUT api/records/:id` accepts `planned_end`. Import accepts records without it.
`POST api/import?mode=merge` merges; without the query it replaces.

The frontend calls `api(method, path, body)`, a thin wrapper over `store.request`. No network
request is made for data.

## Code Style

Vanilla JS, no framework, no build. Small functions, early `fail(status, message)` on bad input in
the store, one route per operation:

```js
'POST api/tasks': b => {
  const name = (b.name || '').trim(), pid = asInt(b.project_id);
  if (!name || pid == null) fail(400, 'name and project_id required');
  checkProjectTask(pid);   // 404 unknown project, 400 task outside project
  const t = { id: nextId('tasks'), project_id: pid, name, completed: 0, created: now() };
  data.tasks.push(t); return t;
},
```

`S` holds all UI state, each view has one `renderX()` function that rebuilds its HTML and rebinds
handlers. User text goes through `esc()` before it enters HTML. Icons come from the SVG sprite via
`icon(name)`. Preferences (theme, accent, start mode, minutes, tick) are one localStorage object;
theme and accent become `data-theme` and `data-accent` on `<html>`.

## Testing Strategy

- `tests/store.test.mjs` with `node --test`: the store against an in-memory storage. Every operation has at least one success test and one bad-input test.
- The archived server keeps its pytest suite in `old.backup.pyserver/tests/`.
- Frontend checks are manual: `tests/MANUAL.md` covers the four views, the three dialogs, the midnight split, themes, the ticking sound, and backup.

## Boundaries

- Always: keep every URL relative, keep the app working with no server, run the store tests before declaring a task done, escape user text before it reaches the DOM.
- Ask first: changing the stored data or the backup JSON format, adding a dependency or a build step, adding a network call.
- Never: add accounts or telemetry, edit `old.backup.pyserver/` for features, clear the user's stored data.

## Success Criteria

1. `python3 -m http.server` at the repository root serves a working app; the four views render without console errors. The same files under https://daspoi.github.io/productivity/ behave the same.
2. Every store operation fails with a status, never throws an unlabelled error, for missing or invalid input.
3. Export then import on a fresh browser produces identical state and records.
4. A record spanning midnight shows the same per-day split in Timeline, Calendar and Reports.
5. The page title and the header label read "Productivity Tracker".
6. `node --test tests/store.test.mjs` passes with at least one success and one failure test per operation.
7. Importing `{}` or a file without `version: 1` is rejected and leaves existing data untouched.
8. Theme and accent choice survive a reload, and every view is readable in both themes.
9. Navigation is a tab row with SVG icons; there is no floating button; every add action is a labeled button next to the list it adds to.
10. The page installs as a standalone app from Chrome on desktop and Android and from Safari on iOS, and the installed copy opens with the network off.
11. A 1-minute countdown ends 60 seconds after start with `end == planned_end`, also when the tab was closed in between; stopping early or starting something else ends it at that moment instead.
12. With the tick toggle on, the sound plays only while a record runs and stops when it ends.
13. A version 1 export from the archived server imports without error.
14. Merging the same backup twice adds nothing the second time; merging a backup from another device adds its rows and keeps local ones; a backup whose rows reference a missing project is rejected and local data is unchanged.
15. Data saved by an earlier version of the app (integer ids) opens without loss and is rewritten with UUID ids.
16. The app makes no network request for data: with the network off, every view, dialog and import works.
