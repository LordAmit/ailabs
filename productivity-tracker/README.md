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

Backup: menu, Export, saves `productivity-backup.json`. Import offers two choices:

- Merge: keeps what is here, adds rows from the file, and takes the file's version of any row that
  exists in both. Merging the same file twice changes nothing the second time.
- Replace all: deletes current data first.

Keep a phone and a desktop in step by exporting on one and merging on the other. Backups from the
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
