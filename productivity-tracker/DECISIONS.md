# Decision log

One entry per decision: what was decided, what else was considered, why. SPEC.md states only the
current result. Newest at the bottom.

## 2026-10-15

**Environment variables renamed to `PRODUCTIVITY_DB` and `PRODUCTIVITY_PORT`.**
The generated names contained dots, which zsh and bash cannot export. Default database file renamed from `amit.productivity.DB` to `productivity.db`; the app renames an old file on first start.

**Default port 5055.** macOS AirPlay Receiver holds 5000 on the user's machine and answers 403. Any open port was acceptable to the user.

**Unknown project on task or record routes returns 404, task outside its project returns 400.** The timer start route already did this; the other routes returned 500 from a foreign key error. 400 for both was considered; one convention across routes won.

**Import validates before deleting.** A `{}` payload used to wipe the database. Now `version == 1` and the three lists are required before the first DELETE.

**Timeline splits records at local midnight.** Calendar and Reports already did; Timeline grouped by start day, so day totals disagreed. Keeping records whole under their start day was considered and rejected for consistency.

**Phone access over Wi-Fi dropped.** The README used to suggest editing the bind host. Options were: keep as a manual edit, add a host variable, drop. Dropped for now; see TODO.md.

**Light and dark themes plus accents teal, blue, purple.** Stored in localStorage as a per-browser preference, not in the database. Applied in `<head>` before first paint to avoid a flash.

**pytest as a dev dependency** in `requirements-dev.txt`, not in runtime requirements.

**Visual parity with the Android app that inspired this project is not a goal.** Feature parity is. The user flagged the round floating + button as an example of something not required.

**The inspiring app is not named anywhere in the project** (user, 2026-10-16). README, SPEC and this file describe the tracker on its own terms.

**Add actions are labeled buttons placed where the result appears.** Three options were offered: labeled buttons in place, a single + icon in the top bar, or adds only in the menu and empty states. The user chose labeled buttons. The floating button was removed.

**Navigation is a tab row under the title with inline SVG icons.** The bottom tab bar was a phone pattern and its icons were text glyphs that depended on the system font. All icons, including play, stop and calendar arrows, now come from one SVG sprite in the page.

**Ticking sound is a looped recording.** First version synthesized a tick with the Web Audio API so no file had to be shipped. The user preferred the Pixabay clip "Household kitchen timer" and added it as `static/sounds/kitchen-timer.mp3` (Pixabay Content License). Looped media is not throttled in hidden tabs, so no scheduler is needed.

**Splitting app.py into modules is deferred** to TODO.md until the API tests exist to verify the split.

**Tab order is Projects, Reports, Timeline, Calendar, and Projects opens on load.** User request; the generated order started on Timeline. Assumption made by Claude: the first tab is also the default view.

**Dialog Cancel and Delete skip form validation.** Bug report: Cancel on an empty New project form refused to close. Both buttons are submit buttons inside a `method="dialog"` form, so the browser ran `required` checks first. Fixed with `formnovalidate` set once in `openDialog`, rather than on each button in each dialog.

**Offline mode and PWA, hosted on GitHub Pages.** The user wanted an installable app that works with no server and exchanges data with the server copy. Design:
- The frontend moved from `static/` plus a Flask template to one plain folder `web/`, served by Flask at `/` and publishable to Pages unchanged. All URLs are relative so the Pages sub-path works.
- `web/store.js` reimplements the 12 API operations over one localStorage JSON blob. localStorage was chosen over IndexedDB: the data is small (a record is about 60 bytes, so tens of thousands fit in 5 MB) and the code is a quarter the size. Returned objects are copies.
- The data source is an explicit switch in the menu with a badge in the title. Automatic fallback when the server is down was rejected: it would split data without the user noticing. With no saved choice, the server is probed once per load, so the Pages copy starts in browser mode.
- Moving data between the two sides is Export then Import, whole snapshots. Merge was rejected for now: both sides assign integer ids from 1, so a merge needs UUIDs or an id remap, which is a backup-format change. Listed in TODO.md.
- The service worker is network first with cache fallback, so a new deploy shows on the next load and the shell still opens offline. API requests bypass the cache.
- A GitHub Actions workflow publishes `web/` on push to main. The repository is not on GitHub yet.

**Development focus moves to the PWA; the Flask server is frozen.** User decision while the countdown feature was being built on both sides. Six server edits for countdowns were reverted the same hour; app.py is as it was after Task 4. New features go into `web/` only. Server mode still works for everything it already did.

**Countdown timer, browser mode only.** Approved from tasks/spec-countdown.md with these answers: mode row on the Projects view rather than a second button per row; presets 15, 25, 45, 60; chime only, no browser notification; countdowns start from Projects only. Data: one extra field `planned_end` on records in the browser store, null for stopwatches, so `end == null` still means running everywhere. Expired countdowns are closed by the store on the next request, at exactly `planned_end`, so a closed tab does not leave one running. The server has no `planned_end`; the frontend sends `minutes` only in browser mode and hides the mode row in server mode.

**Countdown length is an inline drawer, not a dialog.** First build opened a dialog on a second tap of the Countdown chip. The user asked for the numbers to slide out to the right when Countdown is chosen and disappear when Stopwatch is chosen. Clicks in the row toggle classes in place so the CSS transition shows; a re-render would skip it.

**Look and feel after getartcraft.com/apps.** User request. Tokens were read from that site's stylesheet: fonts Archivo, Inter, Geist Mono, Instrument Serif; `border-radius: 0`; light palette ink #101014 on #f2f1ee, dark #f2f1ee on #121316; accent #2d81ff; uppercase mono labels at 11px with .12 to .15em tracking; inverted primary buttons. Applied as a rewrite of style.css only; markup and JS are unchanged apart from the accent swatch hex values. Fonts were first loaded from Google Fonts; the same day they were self-hosted as Latin-only woff2 files (about 160 KB total, not the 1 MB estimated) so the offline copy matches, with the OFL text alongside.

**Tick sound plays only while something runs.** User rule added with the countdown approval. The button is now a saved preference; the sound starts when a record starts and stops when it ends. Browsers block audio without a recent click, so if the page loads with a record already running the sound starts at the next click.

**Flask server archived to `old.backup.pyserver/`.** User request after the PWA was in place. Moved: app.py, requirements, pytest tests, its database. The virtualenv and caches were deleted, since a moved venv has broken absolute paths and is one command to recreate. app.py now points its static folder at `../web`, so the archive still serves the current frontend when run. The frontend keeps the Server data source for that case. README and SPEC describe only the PWA; the archive has its own README.

**Fonts self-hosted.** Google Fonts served the Latin subsets as one woff2 per family (122 KB in all), far below the 1 MB estimate. Files live in `web/fonts/` with the OFL text; `fonts.css` declares them; the service worker caches them, cache name bumped to v2.

**Merge import with UUID ids.** The blocker was integer ids numbered from 1 on every copy. Chosen: ids become UUID strings (`crypto.randomUUID`, with a fallback), stored data and backups move to version 2, and version 1 is still read, both from storage on load and from import, by assigning fresh ids and rewriting references. The alternative, remapping integer ids on every import, was rejected because the same file imported twice could not be recognized. Merge rule: file wins on a shared id, new ids are added, local rows without a counterpart stay. Imports validate on a copy and are rejected whole if a reference is missing. If a merge leaves two running records, the later start stays open and the other is closed at that start. The frontend now treats ids as strings everywhere and converts the archived server's integers on the way in; the archived server accepts version 1 backups only.

**App files at the repository root, deployed as is.** The user hosts the PWA at https://easy.github.io/productivity from the `easy.github.io` Pages repository, by placing this folder at `productivity/`. The `web/` folder was flattened into the root and the Actions workflow removed, since a Pages repository serves its files directly. `.nojekyll` was added so GitHub does not run Jekyll over the files. Relative URLs and the relative service worker scope were already in place, so nothing in the app changed.

**Pages repository is `daspoi/daspoi.github.io`.** The first deploy went to `LordAmit/easy.github.io`, which GitHub serves at `lordamit.github.io/easy.github.io/` because the repository name does not match the owner. The user then chose `daspoi.github.io`, an organisation site whose name matches, so the app is at `daspoi.github.io/productivity/`. The earlier deploy remains in the other repository and can be deleted there. The repository was private; GitHub Pages on a private repository needs a paid plan, so the user chose to make it public. It holds only the app files.

**Deploy by `make`, not by hand or by Actions.** Branch deploy was chosen over GitHub Actions because there is no build; Actions would add a workflow and a run per push for nothing. The Pages repository is checked out next to this one, so the Makefile copies the app files with rsync to the relative path `../easy.github.io/productivity`, after the syntax check and tests, and leaves commit and push to the user. Docs, tests and the archived server are excluded from the copy; `--delete` keeps the target an exact mirror.

**Server data source removed.** With the backend archived and the app on GitHub Pages, the "Server" / "This browser" switch and its badge had no purpose. User request. Removed: the mode switch, the startup probe of `api/state`, the badge, and the integer-to-string id conversion for server responses. `api()` is now a thin wrapper over the store. The store keeps the server's route names as the shape of its operations.

## 2026-10-16

**Guided tour: started by the user, never by itself; no sample data.** TODO.md left two questions open and the user said "proceed", so both answers are assumptions made by Claude, open to change:
- Start: a "Guided tour" entry under Help in the menu, plus a "Take the tour" link in the empty Projects view until the tour has been finished or skipped once (`tourSeen` in the preferences object). Starting it unasked on first load was rejected: the empty state already offers it, and an overlay nobody asked for is the first thing a new user would have to dismiss.
- Sample data: none is written to the store, which would have touched stored data (an "ask first" item in SPEC.md) and needed cleanup. Instead, when there is no project the tour renders the mode row and one demo project card into the view, and when nothing runs it fills the hidden running bar with demo text; both are DOM only and the next render removes them. With real projects and a running timer the tour points at the real ones.
- Form: seven cards (welcome, mode row, play button, running bar, tabs, backup, theme) over the live page with a cut-out around the target, built from a fixed overlay and a box-shadow, no library. The two menu cards point at the same menu button, and the Theme card carries the live theme and accent chips so the user can try them without leaving the tour. Highlighting inside the open menu dialog was rejected: a modal dialog sits in the top layer above any overlay.
- Verified in headless Chrome (CDP script, 2026-10-16): all seven cards with and without data, phone width, arrow keys and Esc, stored data unchanged.

**Keyboard shortcuts: "?" shows the list (user); the key map is an assumption made by Claude.** Single keys without a modifier, so nothing collides with browser shortcuts: 1 to 4 for the views in tab order, N, T, R for the three add dialogs, S for the timer, M for the mode, arrows for the Calendar month, comma for the menu, Esc for back. S with nothing running starts the open project, or else the project of the most recent record, so one key resumes yesterday's work; starting on the first project in the list was rejected as a guess the user would not expect. Keys are ignored while a field has focus, while a dialog is open, and during the tour, which keeps its own arrow and Esc handling. The list is a dialog built with `openDialog`, so Esc and the Close button behave like every other dialog, and it is also in the menu under Help for touch devices. Verified in headless Chrome (CDP script, 2026-10-16): every key, typing in a field, and the dialog toggle.

**Paste to create many tasks: markers stripped, confirmation above five lines.** Both answers to the open questions in TODO.md are assumptions made by Claude. List markers ("- ", "* ", "1. ", "1)", "[ ] ", and "- [x] ") are dropped because text copied from a notes app or a Markdown file nearly always carries them and nobody wants them in a task name; the checkbox state is not read, every line becomes an open task. The confirmation uses the browser `confirm()` already used for Delete, with the threshold at five, since five is the most anyone adds by accident. Only the New task dialog splits; Edit task keeps a normal paste. A single line pastes normally, so the feature never gets in the way. Verified in headless Chrome (synthetic paste events, 2026-10-16).

**Sub-tasks: three levels, a parent keeps its own timer, time rolls up into the parent row.** The three answers are the user's (2026-10-16). Carried out as one nullable field, `parent_id`, on tasks: stored data and backups stay version 2 and a missing field reads as null, the same way `planned_end` was added. Assumptions made by Claude around them: the parent is fixed when the task is made, since moving a subtree needs depth and cycle checks in a dialog for a case nobody has asked for; deleting a task deletes its subtree after a confirmation that names the count, because leaving orphans or promoting them silently both surprise; marking a parent done leaves its sub-tasks as they are; the "+ Sub" link sits on the row rather than in the edit dialog so a sub-task is one tap away; the record dialog shows tasks indented in tree order. Roll-up is computed in the project view only, so reports, which are by project, did not change. Store tests cover depth, cross-project parents, subtree delete, export and import of the field, and rejection of bad or cyclic parents on import.

**Undo after delete replaces the confirmation dialogs** (user, 2026-10-16, chosen from five suggested features; the other four were discarded). The delete runs at once, and the rows it removes (a project with its tasks and records, a task subtree with the records that pointed into it, or one record) are kept in memory for eight seconds behind an "Undo" bar at the bottom of the screen. Undo is a merge import of those rows: `api/import?mode=merge` already restores rows by id, records and their task links included, so the store gained no code, only a test. Deferring the delete until the bar expires was rejected because every view would have to hide the pending rows. Eight seconds and "a new delete replaces the previous offer" are assumptions made by Claude. The two `confirm()` calls, for projects and for tasks with sub-tasks, are gone.

## Defects found in the generated code, 2026-10-15

Listed for the record; all fixed unless noted.

| # | Problem | Resolution |
|---|---|---|
| D1 | Env var names with dots cannot be set from a shell | Renamed |
| D2 | Default DB name did not match the README | `productivity.db`, with migration of the old file |
| D3 | Export filename was a rename leftover | `productivity-backup.json` |
| D4 | Page title was a rename leftover | "Productivity Tracker" |
| D5 | 500 on unknown project for task and record create | 404 |
| D6 | Import accepted `{}` and wiped the database | Validate before delete |
| D7 | Record update could point at a missing project or foreign task | Same check as create |
| D8 | Timeline counted cross-midnight records on one day only | Split at midnight |
| D9 | Project detail fetches all records and filters in JS | Left as is; see TODO.md |
| D10 | Database created on import, so tests touched the real file | App factory |
| D11 | Project detail, Recent: every record after the first showed "Invalid Date" and "NaNs", because `map(recHtml)` passed the array index as the day segment (found 2026-10-16) | Call `recHtml(r)` with one argument |
