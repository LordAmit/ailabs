# Tasks

Order follows tasks/plan.md. One task at a time, verify before moving on.
Test commands: `.venv/bin/python -m pytest -q` and `node --test tests/store.test.mjs`
Note: Task 12 moved `static/` and `templates/index.html` into `web/`. On 2026-10-15 evening the server (app.py, requirements, pytest tests) moved to `old.backup.pyserver/` and is archived, and `web/` was flattened into the repository root for deployment as is. File names in earlier tasks are as they were at the time.

## Task 1: create_app factory and pytest harness

**Description:** Turn app.py into an app factory so tests can use a temporary database, and add pytest with a conftest that provides a client per test. Fixes SPEC D10.

**Acceptance criteria:**
- [x] `create_app(db_path=None)` returns a Flask app; `None` means the env default
- [x] `python app.py` still serves the page (checked on port 5050; 5000 is taken by macOS AirPlay Receiver on this machine)
- [x] `tests/conftest.py` gives each test a fresh temp DB and client; one smoke test hits `/api/state`

**Verification:**
- [x] Tests pass: `.venv/bin/pip install -r requirements-dev.txt && .venv/bin/python -m pytest -q` (3 passed, 2026-10-15)
- [x] Manual check: server started, `/` returned 200, `/api/state` returned empty state

**Dependencies:** None

**Files likely touched:** app.py, requirements-dev.txt, tests/conftest.py, tests/test_api.py

**Estimated scope:** M

## Task 2: Rename leftovers (SPEC D1 to D4)

**Description:** Replace the dotted env var names, which zsh cannot set, and the other leftovers from the earlier rename. Migrate an existing old database file on startup.

**Acceptance criteria:**
- [x] Env vars `PRODUCTIVITY_DB` and `PRODUCTIVITY_PORT`; default DB `productivity.db`; export filename `productivity-backup.json`; page title "Productivity Tracker"
- [x] `grep -ri 'amit\.productivity' --exclude-dir=.venv .` finds only the `LEGACY_DB_NAME` constant used for migration, plus docs
- [x] If `amit.productivity.DB` exists and `productivity.db` does not, startup renames it and logs one line

**Verification:**
- [x] Tests pass: 9 passed (env var, default name, legacy rename both ways, export filename, page title)
- [x] Manual check: `PRODUCTIVITY_PORT=5050 PRODUCTIVITY_DB=... .venv/bin/python app.py` from zsh served `/` with 200

**Dependencies:** Task 1

**Files likely touched:** app.py, templates/index.html, static/app.js, README.md, tests/test_api.py

**Estimated scope:** M

## Task 3: API validation for tasks and records (SPEC D5, D7)

**Description:** Check that the project exists and the task belongs to it before inserting or updating, so bad input returns 4xx instead of a foreign key 500.

**Acceptance criteria:**
- [x] POST /api/tasks, POST /api/records, PUT /api/records with an unknown project return 404
- [x] A task from another project returns 400
- [x] No route returns 500 for missing or invalid input

**Verification:**
- [x] Tests pass: 17 passed, one bad-input test per case (2026-10-15)

**Dependencies:** Task 1

**Files likely touched:** app.py, tests/test_api.py

**Estimated scope:** S

## Task 4: Import validation (SPEC D6)

**Description:** Validate the backup payload before deleting anything, so an empty or foreign file cannot wipe the database.

**Acceptance criteria:**
- [x] Payload without `version == 1` or without `projects`, `tasks`, `records` lists returns 400 and leaves data unchanged
- [x] Export followed by import on a fresh DB gives identical `/api/state` and `/api/records`

**Verification:**
- [x] Tests pass: four reject tests plus `test_export_import_roundtrip` (2026-10-15)

**Dependencies:** Task 1

**Files likely touched:** app.py, tests/test_api.py

**Estimated scope:** S

## Checkpoint: After Tasks 1-4
- [x] `pytest -q` green, every route has a success and a bad-input test (26 passed, 2026-10-15)
- [x] App starts from zsh with the new env vars (checked on port 5050)
- [ ] Review with human before proceeding

## Task 5: Timeline midnight split (SPEC D8)

**Description:** Build the Timeline from per-day segments, as Calendar and Reports already do, so day totals agree across views.

**Acceptance criteria:**
- [x] A record from 23:30 to 00:30 appears under both days with 30m each (segment logic checked with Node against the real app.js helpers)
- [x] Timeline day totals equal Calendar day totals (both now sum the same segments; Calendar day rows also show the day's segment)
- [x] Clicking either row opens the full record for editing (rows carry the record id, not the segment)

**Verification:**
- [x] Logic check: `node --check static/app.js` and a Node script over `segments()` passed (2026-10-15)
- [ ] Browser check by the user: seed a 23:30 to 00:30 record, compare Timeline and Calendar

**Dependencies:** None

**Files likely touched:** static/app.js

**Estimated scope:** S

## Task 6: Light and dark theme plus accent colors

**Description:** Add a theme setting (light, dark, system) and an accent choice (teal, blue, purple) to the menu dialog, stored in localStorage and applied through CSS tokens.

**Acceptance criteria:**
- [x] Menu dialog offers theme (system, light, dark) and accent (teal, blue, purple); saved to localStorage; applied in `<head>` before first paint
- [ ] All four views and all dialogs are readable in both themes; inputs follow the theme (browser check pending)
- [x] Charts, chips, play buttons and the FAB use the accent token; no hard-coded white left except the token definitions

**Verification:**
- [x] `node --check static/app.js` passes; pytest still 26 passed (2026-10-15)
- [ ] Browser check by the user: tests/MANUAL.md theme section

**Dependencies:** None

**Files likely touched:** static/style.css, static/app.js, templates/index.html

**Estimated scope:** M

## Checkpoint: After Tasks 5-6
- [x] Cross-midnight record agrees in all three views (user browser check, 2026-10-15: "looks good")
- [x] Both themes checked with each accent (user browser check, 2026-10-15)
- [x] Review with human: approved 2026-10-15

## Task 7: Docs

**Description:** Update the README for the new setup, env vars and test command, drop the Wi-Fi sentence, and write the manual checklist.

**Acceptance criteria:**
- [x] README covers setup, run, env vars, test, backup; no Wi-Fi sentence
- [x] `tests/MANUAL.md` lists checks for the four views, three dialogs, import/export, midnight split, themes

**Verification:**
- [ ] Manual check: walk the checklist once (user)

**Dependencies:** Tasks 2, 5, 6

**Files likely touched:** README.md, tests/MANUAL.md

**Estimated scope:** S

## Task 8: Ticking sound toggle

**Description:** A top-bar button that starts and stops a looping kitchen-timer recording (`static/sounds/kitchen-timer.mp3`, Pixabay, added by the user). First version was a synthesized tick; replaced at the user's request on 2026-10-15.

**Acceptance criteria:**
- [x] One press starts the ticking; the next press stops it; the button shows its on state (user confirmed the synthesized version works; recording swap pending check)
- [ ] Ticking continues when the tab is hidden
- [x] Off on every page load

**Verification:**
- [x] `node --check static/app.js` passes, pytest 26 passed (2026-10-15)
- [ ] Manual check by user: toggle on, switch tabs for 30 seconds, come back, toggle off

**Dependencies:** None

**Files likely touched:** templates/index.html, static/app.js, static/style.css

**Estimated scope:** S

## Task 9: Labeled add buttons, floating button removed

**Description:** Replace the round floating + button with labeled buttons where the result appears: "+ New project" above the project list, "+ Add record" in the Timeline header and under the selected Calendar day. Empty states get the same buttons. Chosen by the user from three options on 2026-10-15.

**Acceptance criteria:**
- [x] No floating button; nothing overlaps the running bar (all `fab` references removed from HTML, CSS, JS)
- [x] Projects: "+ New project" at the top of the list and in the empty state
- [x] Timeline and Calendar: "+ Add record"; from Calendar the dialog is pre-filled with the selected day 09:00 to 10:00

**Verification:**
- [x] `node --check static/app.js` passes, pytest 26 passed (2026-10-15)
- [ ] Manual check by user: each add button opens the right dialog; empty states still offer a way to add

**Dependencies:** None

**Files likely touched:** templates/index.html, static/app.js, static/style.css, tests/MANUAL.md

**Estimated scope:** S

## Task 10: Top tab navigation with SVG icons

**Description:** Replace the phone-style bottom bar and its text glyph icons with a tab row under the title, using an inline SVG sprite for the four views and the three header buttons.

**Acceptance criteria:**
- [x] Tabs sit under the title, each with an SVG icon and label; active tab underlined in accent
- [x] Header back, tick and menu buttons use SVG icons from the same sprite
- [x] No bottom bar; running bar sits at the bottom edge; no leftover `--nav-h` or `.bottomnav`

**Verification:**
- [x] `node --check static/app.js`, pytest 26 passed (2026-10-15)
- [ ] Manual check by user: tabs render with icons at desktop and narrow widths

**Dependencies:** None

**Files likely touched:** templates/index.html, static/style.css, static/app.js, tests/MANUAL.md

**Estimated scope:** S

## Task 11: Dialog Cancel bug and tab order

**Description:** Bug: Cancel on a dialog with an empty required field did not close it. Feature: tabs reordered to Projects, Reports, Timeline, Calendar with Projects as the default view.

**Acceptance criteria:**
- [x] Cancel and Delete close the dialog regardless of field validity (`formnovalidate` set in `openDialog`)
- [x] Tab order Projects, Reports, Timeline, Calendar; Projects shown on load

**Verification:**
- [x] `node --check static/app.js`, pytest 26 passed (2026-10-15)
- [ ] Manual check by user: MANUAL.md Views section, first three lines

**Dependencies:** None

**Files likely touched:** static/app.js, templates/index.html

**Estimated scope:** XS

## Task 12: Offline mode and PWA

**Description:** Frontend moved to `web/` as plain static files. `store.js` implements the API in the browser over localStorage. Menu switch and title badge for the data source. Service worker, manifest, icons. GitHub Pages workflow. See DECISIONS.md for the design.

**Acceptance criteria:**
- [x] `web/` serves unchanged from Flask and from a plain static server; all URLs relative
- [x] Browser store passes the same cases as the API tests (8 Node tests)
- [x] Explicit data source switch with badge; export and import work in both modes with one format
- [ ] Installs on desktop and phone; installed Pages copy opens offline (user check)

**Verification:**
- [x] `node --check` on app.js, store.js, sw.js; pytest 26 passed; `node --test tests/store.test.mjs` 8 passed (2026-10-15)
- [x] Flask serves every shell file with the right content type
- [ ] Manual check by user: tests/MANUAL.md, Data source and offline section

**Dependencies:** None

**Files likely touched:** app.py, web/*, tests/store.test.mjs, .github/workflows/pages.yml, .gitignore

**Estimated scope:** L (9 files), done as one task because the move to `web/` touched all of them

## Task 13: Countdown timer, browser mode only

**Description:** Spec approved 2026-10-15 (tasks/spec-countdown.md, now merged into SPEC.md and DECISIONS.md). Server work was started and reverted at the user's request; the server is frozen. `store.js` gained `planned_end`, `minutes` on start, and close-on-expiry. Frontend: mode row, length dialog, countdown running bar, chime.

**Acceptance criteria:**
- [x] Store: countdown start sets `planned_end`; bad minutes 400; expired closes at `planned_end`; early stop and new start end it now; import without the field works (5 Node tests)
- [x] Mode row on Projects list and detail in browser mode, hidden in server mode; last length remembered
- [ ] Running bar counts down, chime at zero, record closed (user check)

**Verification:**
- [x] `node --check`; `node --test tests/store.test.mjs` 13 passed; pytest 26 passed (2026-10-15)
- [ ] Manual check by user: tests/MANUAL.md, Countdown section

**Dependencies:** Task 12

**Files likely touched:** web/store.js, web/app.js, web/index.html, web/style.css, tests/store.test.mjs

**Estimated scope:** M

## Task 14: Tick sound only while a record runs

**Description:** The tick button became a saved preference. `syncTick()` runs on every render and plays the loop only while `S.running` is set.

**Acceptance criteria:**
- [x] Toggle on with nothing running: no sound; start a record: sound; stop: silence; toggle persists
- [ ] Verified in the browser (user check)

**Verification:**
- [x] `node --check web/app.js`
- [ ] Manual check by user: tests/MANUAL.md, Ticking sound section

**Dependencies:** None

**Files likely touched:** web/app.js, web/index.html

**Estimated scope:** XS

## Task 15: Self-hosted fonts

**Description:** Four Latin woff2 files from Google Fonts in `web/fonts/`, declared in `web/fonts.css`, added to the service worker shell. OFL text alongside.

**Acceptance criteria:**
- [x] No request to Google Fonts; fonts served from `web/fonts/` (122 KB total)
- [ ] Installed copy offline shows the same fonts (user check)

**Verification:**
- [x] Static server returns 200 and `font/woff2` for all four files (2026-10-15)

**Files likely touched:** web/fonts/, web/fonts.css, web/index.html, web/sw.js

**Estimated scope:** S

## Task 16: Merge import with UUID ids

**Description:** Ids are UUID strings; stored data and backups are version 2; version 1 is accepted and rewritten. Import dialog offers Merge or Replace all. See DECISIONS.md.

**Acceptance criteria:**
- [x] Store tests: v2 round trip, v1 import with rewritten references, merge adds and overwrites by id, idempotent re-merge, two running records resolved, invalid merge rejected with data intact, v1 storage migrates on load
- [x] Frontend treats ids as strings; archived server integers converted on the way in
- [ ] Import dialog in the browser: Merge and Replace all both work (user check)

**Verification:**
- [x] `node --test tests/store.test.mjs` 19 passed; `node --check` on app.js and store.js (2026-10-15)
- [ ] Manual check by user: tests/MANUAL.md, Backup section

**Files likely touched:** web/store.js, web/app.js, tests/store.test.mjs

**Estimated scope:** M

## Task 17: Remove the server data source

**Description:** The Server / This browser switch, badge and startup probe are gone; the app only uses the store. User request after the move to GitHub Pages.

**Acceptance criteria:**
- [x] No badge, no Data source row, no fetch of `api/state` on load
- [x] Countdown row shown always; import dialog always offers Merge

**Verification:**
- [x] `node --check app.js`; store tests 19 passed; deployed with `make` (2026-10-15)

**Files likely touched:** app.js, index.html, style.css

**Estimated scope:** S

## Task 18: Guided tour

**Description:** Seven cards over the Projects view pointing at the mode row, a play button, the running bar, the tabs and the menu (backup, theme). Started from the menu or from the empty Projects view; never by itself. No sample data: demo card and demo running bar in the DOM only. See DECISIONS.md 2026-10-16.

**Acceptance criteria:**
- [x] Menu, Help, Guided tour starts it; "Take the tour" in the empty Projects view until finished or skipped once
- [x] Page is inert under the tour; Skip, Back, Next/Done, arrow keys, Esc
- [x] Stored data identical before and after, with and without projects
- [ ] Manual check by user: tests/MANUAL.md, Guided tour section

**Verification:**
- [x] `node --check app.js`; store tests pass; headless Chrome run through all cards with and without data and at phone width (2026-10-16)

**Files touched:** app.js, index.html, style.css, SPEC.md, README.md, DECISIONS.md, TODO.md, tests/MANUAL.md

**Estimated scope:** S

## Task 19: Keyboard shortcuts

**Description:** Single-key shortcuts with a "?" list dialog, also under Help in the menu. Key map in README.md; rationale in DECISIONS.md 2026-10-16.

**Acceptance criteria:**
- [x] ? opens and closes the list; every listed key does what it says
- [x] No key acts while a field has focus, while a dialog is open, or during the tour
- [ ] Manual check by user: tests/MANUAL.md, Keyboard shortcuts section

**Verification:**
- [x] `node --check app.js`; store tests pass; headless Chrome run over every key (2026-10-16)

**Files touched:** app.js, style.css, SPEC.md, README.md, DECISIONS.md, TODO.md, tests/MANUAL.md

**Estimated scope:** S

## Task 20: Paste to create many tasks

**Description:** In New task, a multi-line paste creates one task per non-empty line, markers stripped, confirmation above five lines. See DECISIONS.md 2026-10-16.

**Acceptance criteria:**
- [x] Three pasted lines create three tasks in order and close the dialog
- [x] One line pastes into the field as usual; Edit task is unchanged
- [x] Six lines ask first; declining creates nothing
- [ ] Manual check by user: tests/MANUAL.md, Paste tasks section

**Verification:**
- [x] `node --check app.js`; headless Chrome with synthetic paste events (2026-10-16)

**Files touched:** app.js, SPEC.md, README.md, DECISIONS.md, TODO.md, tests/MANUAL.md

**Estimated scope:** XS

## Task 21: Sub-tasks

**Description:** `parent_id` on tasks, three levels, subtree delete, tree in project detail with rolled-up time, "+ Sub" link, indented task select. See DECISIONS.md 2026-10-16.

**Acceptance criteria:**
- [x] Store: parent in same project, fourth level rejected, subtree delete unlinks records, field survives export and import, bad or cyclic parents rejected on import, old data loads
- [x] Project detail shows the tree with rolled-up time; "+ Sub" absent on the third level
- [x] Deleting a parent asks and names the count; declining keeps everything
- [ ] Manual check by user: tests/MANUAL.md, Sub-tasks section

**Verification:**
- [x] `node --test tests/store.test.mjs` 25 pass; `node --check`; headless Chrome run over the project view, dialogs and delete (2026-10-16)

**Files touched:** store.js, app.js, style.css, tests/store.test.mjs, SPEC.md, README.md, DECISIONS.md, TODO.md, tests/MANUAL.md

**Estimated scope:** M

## Task 22: Undo after delete

**Description:** Delete at once, keep the rows for eight seconds, Undo merges them back. Confirmations removed. See DECISIONS.md 2026-10-16.

**Acceptance criteria:**
- [x] Record, task subtree and project deletes each show the bar; Undo restores every row and record link
- [x] After eight seconds the bar is gone and the delete stands
- [x] The bar sits above the running bar while a timer runs
- [ ] Manual check by user: tests/MANUAL.md, Undo section

**Verification:**
- [x] Store test for merge-based restore, 26 pass; headless Chrome run over all three deletes and the timeout (2026-10-16)

**Files touched:** app.js, index.html, style.css, tests/store.test.mjs, SPEC.md, README.md, DECISIONS.md, tests/MANUAL.md

**Estimated scope:** S

## Task 23: Task line parser

**Description:** `parseTaskLine(text)` in store.js, exported with createStore: splits at the last "!" into name and estimate in minutes, 1 to 720, or returns the whole text as the name. Spec: tasks/spec-task-estimate.md, Parsing.

**Acceptance criteria:**
- [x] "do blah !15 min", "do blah!15min", "do blah !15m", "do blah !1h", "do blah !1h30m", "do blah !1:30", "do blah !90" give name "do blah" and the expected minutes
- [x] "name only", "Ship it!", "a !b", "x !0", "x !721", "x !2.5", "!15" give the full trimmed text as name and estimate null
- [x] "Ship it! !15 min" gives "Ship it!" and 15

**Verification:**
- [x] `node --test tests/store.test.mjs` passes with one test per group above; `node --check store.js` (2026-10-22)

**Dependencies:** None

**Files touched:** store.js, tests/store.test.mjs

**Estimated scope:** S

## Task 24: Estimate field and start rule in the store

**Description:** `estimate` on tasks (create, update, clear, load of old data, export, import validation) and the timer start rule: a task with an estimate starts a countdown of the remaining seconds, or a stopwatch when nothing is left; `minutes` is ignored for such a task. Spec: Store section.

**Acceptance criteria:**
- [x] POST api/tasks with estimate 15 stores 15; without it stores null; PUT with null clears; 0, 721, 2.5, "abc" give 400 on both
- [x] Old stored data and version 2 backups without the field load with null; export carries the field; import rejects a bad value
- [x] Start on a task with estimate 15 and 5 minutes of ended records gives planned_end = start + 600; with 15 or more gives null; a `minutes` in the body changes nothing; sub-task records do not count
- [x] Start on a task without an estimate still honours `minutes`

**Verification:**
- [x] `node --test tests/store.test.mjs` passes; `node --check store.js`

**Dependencies:** None (same files as Task 23, so run after it)

**Files touched:** store.js, tests/store.test.mjs

**Estimated scope:** M

## Task 25: Dialogs, task row and start call

**Description:** New task and paste use the parser; Edit task gets an Estimate field and parses Name; the task row shows the estimate line; startTimer sends `minutes` only when the Countdown chip is on and the task has no estimate. Spec: Frontend section.

**Acceptance criteria:**
- [x] Typing "write intro !15 min" in New task creates "write intro" with a 15 minute estimate; the hint under Name names the "!" form
- [x] A pasted three-line list with two lengths creates three tasks, two with estimates
- [x] Edit task shows the estimate, a blank clears it, a length in Name replaces the field's value
- [x] Row reads "15m" with nothing tracked, "10m left of 15m" after 5 minutes, "over by 3m of 15m" after 18; hours as "1h30m"; the running record counts live; sub-task time does not count
- [x] Play on a task with time left starts a countdown whatever the chip is; with none left, a stopwatch; a task without an estimate behaves as before

**Verification:**
- [x] `node --check app.js`; headless Chrome run over New task, paste, Edit task, the row and play in both chip modes: 20 checks pass (2026-10-22)
- [ ] Manual check by user: tests/MANUAL.md, Estimates section

**Dependencies:** Tasks 23 and 24

**Files touched:** app.js, style.css

**Estimated scope:** M

## Task 26: Docs and version

**Description:** Fold the feature spec into SPEC.md (story 20, Data Model, Operations, UI); README "Estimates" paragraph under Timers; tour sentence on the Stopwatch or countdown card; tests/MANUAL.md section; DECISIONS.md entry for 2026-10-22 ("!" separator, Edit parses too, completed tasks keep the line, no roll-up); TODO.md; version label 0.1.0-alpha.6.

**Acceptance criteria:**
- [x] SPEC.md describes the app as it now is; tasks/spec-task-estimate.md removed, its content is in SPEC.md story 20 and DECISIONS.md
- [x] README, MANUAL.md, DECISIONS.md and the tour text match the built behaviour
- [x] index.html reads version 0.1.0-alpha.6

**Verification:**
- [x] `make check` and `make test` pass (34 tests); success criteria 1 to 7 covered by the store tests and the headless run (2026-10-22)

**Dependencies:** Task 25

**Files touched:** SPEC.md, README.md, DECISIONS.md, TODO.md, tests/MANUAL.md, app.js (tour text), index.html

**Estimated scope:** S

## Checkpoint: Complete

- [ ] SPEC.md success criteria 1 to 20 met
- [ ] Ready for review
