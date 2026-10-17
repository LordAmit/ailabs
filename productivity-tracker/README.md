# Productivity Tracker

A single-user time tracker: projects, optional tasks,
stopwatch and countdown timers, a timeline, reports and a calendar. It is a web app that runs
entirely in the browser and installs as a PWA on desktop and phone. Data stays in the browser;
backups are JSON files.

## Run

The app is the repository root: `index.html` and the files next to it. Serve it with any static
file server:

    python3 -m http.server 8000

Open http://localhost:8000. No build step, no backend.

## Install as an app

Chrome or Edge: the install icon at the right end of the address bar. Safari on iOS: Share, then
Add to Home Screen. Android Chrome: menu, Add to Home screen. The installed app opens with the
network off.

### GitHub Pages

The app lives at https://daspoi.github.io/productivity/. The `daspoi.github.io` repository is checked
out at `~/git/daspoi.github.io` (this project is at `~/git/antigravity/productivity-tracker`) and
serves its root with "Deploy from a branch".

    make

copies the app files (not the docs, tests or the archived server) into
`../../daspoi.github.io/productivity/`, after the syntax check and the store tests. Then commit and push
in that repository. `make DEPLOY=/other/path` copies elsewhere. The copy also places `.nojekyll` at
the Pages repository root; without it GitHub runs Jekyll over the files on branch deploys.

## Data

Everything is stored in the browser's localStorage for the site you opened. Each origin
(`localhost:8000`, your Pages URL, an installed copy) has its own data. Clearing site data deletes it.

Deleting a project, task or record happens at once. A bar at the bottom offers Undo for eight
seconds and brings everything back, records included.

Backup: menu, Export, saves `productivity-backup.json`. Import offers two choices:

- Merge: keeps what is here, adds rows from the file, and takes the file's version of any row that
  exists in both. Merging the same file twice changes nothing the second time.
- Replace all: deletes current data first.

To use a phone and a desktop with the same data, export on one and merge on the other. Backups from the
archived server or from older versions of this app (version 1, integer ids) import fine; their rows
get new ids, so merge such a file only once.

## Timers

Projects view, mode row above the list: Stopwatch, or Countdown. Choosing Countdown slides out
the lengths (15, 25, 45, 60 or any minutes). A countdown ends on its own at the planned time,
even if the page was closed, and chimes if the page is open. Starting anything stops what was
running.

The timer button in the top bar toggles a ticking sound that plays only while a stopwatch or
countdown runs. The clip is "Household kitchen timer" from Pixabay (`sounds/kitchen-timer.mp3`),
Pixabay Content License.

## Tour

Menu, Guided tour: seven cards over the Projects view that point at the mode row, a play button,
the running bar, the tabs, and the menu for backup and theme. On a fresh copy the empty Projects
view also offers "Take the tour" until it has been finished or skipped once. The tour never
starts on its own and changes no data.

## Sub-tasks

In a project, "+ Sub" on a task row adds a task under it, up to three levels. A parent can have
its own timer. Each row shows the time of the task and everything under it; reports stay by
project. Deleting a task deletes its sub-tasks after a confirmation.

## Tasks from a list

In the New task dialog, paste text with line breaks to add one task per non-empty line. Leading
list markers such as "- ", "1. " or "[ ] " are dropped. More than five lines ask for confirmation.

## Keyboard

Press ? for the list. 1 to 4 switch views, N new project, T add a task to the open project, R add
a record, S stops the timer or starts one on the open project or else the last tracked project,
M switches stopwatch and countdown, left and right arrows move the Calendar month, comma opens
the menu, Esc closes a dialog or goes back to the project list. Keys do nothing while you type
in a field. The list is also in the menu under Help.

## Appearance

Menu: theme (system, light, dark) and accent (teal, blue, purple). Fonts are Archivo, Inter,
Geist Mono and Instrument Serif, shipped in `fonts/` under the SIL Open Font License.

## Tests

    node --test tests/store.test.mjs

Frontend checks are manual: `tests/MANUAL.md`.

## Layout

    index.html, app.js, store.js, sw.js, style.css, fonts.css, manifest.webmanifest, icon*  the app
    fonts/, sounds/      web fonts (SIL OFL) and the ticking clip
    .nojekyll            tells GitHub Pages to serve the files as they are
    Makefile             make: check, test, copy to the Pages checkout; make serve: local server
    tests/               store tests and the manual checklist
    SPEC.md              what the app does
    DECISIONS.md         why, with alternatives considered
    TODO.md              deferred work
    tasks/               implementation plan and task status
    old.backup.pyserver/ the earlier Flask backend, archived; see its README

## Archived server

`old.backup.pyserver/` holds the original Flask and SQLite backend, kept for reference. The app
no longer talks to it. Its backups (version 1) can still be imported.
