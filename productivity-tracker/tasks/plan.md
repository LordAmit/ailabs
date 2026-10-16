# Implementation Plan: Productivity Tracker cleanup

## Overview

Bring the generated app up to the approved SPEC.md: a test harness, the rename cleanup, API input
validation, safe import, a consistent midnight split in the Timeline, and light/dark themes with an
accent color choice. Tasks with acceptance criteria live in tasks/todo.md.

## Architecture Decisions

- `create_app(db_path)` factory in app.py. Tests get a temp database; `python app.py` keeps working through a module-level `app` built from the env default. Chosen over a global because importing the module currently writes to the real database (SPEC D10).
- Validation returns 404 for an unknown project and 400 for a task outside its project, the convention the timer start route already uses. One convention across all routes.
- Import validates the whole payload before the first DELETE. Nothing is removed until the file is known to be a version 1 export with three lists.
- Theme and accent are per-browser preferences, stored in localStorage and applied as `data-theme` and `data-accent` attributes on `<html>`. Not in the database, so no schema change.
- Timeline reuses the existing `segments()` helper that Calendar and Reports already use, so all three views agree on day totals.

## Dependency graph

```
T1 create_app + pytest harness
    ├── T2 rename (env vars, DB name, export name, title)
    ├── T3 API validation
    └── T4 import validation
T5 timeline midnight split      (frontend only, independent of T1 to T4)
T6 themes and accent colors     (frontend only, independent of T1 to T4)
T7 docs                         (after T2, T5, T6)
```

## Task List

### Phase 1: Foundation and backend correctness
- [ ] T1: create_app factory and pytest harness (M)
- [ ] T2: Rename leftovers (M)
- [ ] T3: API validation for tasks and records (S)
- [ ] T4: Import validation (S)

### Checkpoint: Backend
- [ ] `pytest -q` green, every route has a success and a bad-input test
- [ ] `PRODUCTIVITY_DB=/tmp/x.db .venv/bin/python app.py` serves the page from zsh
- [ ] Review with human before Phase 2

### Phase 2: Frontend
- [ ] T5: Timeline midnight split (S)
- [ ] T6: Light and dark theme plus accent colors (M)

### Checkpoint: Frontend
- [ ] Cross-midnight record shows the same split in Timeline, Calendar, Reports
- [ ] All four views and all dialogs readable in both themes with each accent
- [ ] Review with human before Phase 3

### Phase 3: Docs
- [ ] T7: README and manual checklist (S)

### Checkpoint: Complete
- [ ] SPEC.md success criteria 1 to 9 walked once
- [ ] Ready for review

## Parallelization

T2, T3, T4 all edit app.py, so run them in sequence. T5 and T6 touch only static/ and templates/
and can run alongside Phase 1 in a second session if wanted.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| T1 breaks `python app.py` startup | High | Keep module-level `app = create_app()`; smoke test imports and hits `/` |
| T2 default DB rename leaves the user's existing `amit.productivity.DB` behind | Med | On startup, rename the old file to `productivity.db` if the new one is absent; log one line |
| T6 CSS has hard-coded `#fff` on colored buttons and `color-scheme: dark` on inputs | Med | Add an `--on-accent` token; set `color-scheme` from the theme attribute |
| T5 segment rows must still open the full record on click | Low | Keep `data-id` on the record, not the segment, and look up by record id |

## Open Questions

None.
