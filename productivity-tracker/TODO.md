# TODO (deferred work)

Out of the current plan, agreed on 2026-10-15. See SPEC.md for context.

- [x] Merge import (done 2026-10-15: UUID ids, backup version 2, Merge or Replace on import, version 1 still accepted)
- [x] Self-host the four web fonts (done 2026-10-15: `fonts/`, `fonts.css`, in the service worker shell list)
- [ ] Keyboard shortcuts: add a task, start and stop the timer or stopwatch, switch views, and similar. Needs a decision on the key map and a way to show it (a "?" overlay).
- [ ] Guided tour: a button (menu or first run) that walks through the features step by step, highlighting the mode row, play buttons, running bar, tabs, backup and theme. Needs a decision on whether it starts by itself on first use and whether to use sample data.
- [ ] Paste to create many tasks: pasting text with line breaks into the task name field creates one task per non-empty line. Needs a decision on whether to strip list markers such as "- " or "1. ", and whether to confirm before creating more than a few.
- [ ] Sub-tasks: tasks nested under a task. Needs a decision on depth (one level or any), how the timer applies to a parent with children, and how reports roll up.

Dropped when the Flask server was archived: splitting app.py, a server-side project filter, and Wi-Fi access to the server.
