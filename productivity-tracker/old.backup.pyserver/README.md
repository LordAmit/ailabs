# Archived Flask server

The original backend of Productivity Tracker, kept for reference. Development moved to the PWA at
the repository root on 2026-10-15. The PWA no longer talks to any server; the "Server" data source
was removed the same day. This code still runs on its own, with its own tests, and its version 1
exports can be imported into the PWA.

Contents: `app.py` (Flask app factory, SQLite schema, API), `requirements*.txt`, `tests/` (pytest,
26 tests), `productivity.db` (the data it held when archived).

Run:

    cd old.backup.pyserver
    python3 -m venv .venv
    .venv/bin/pip install -r requirements-dev.txt
    .venv/bin/python app.py          # http://127.0.0.1:5055
    .venv/bin/python -m pytest -q

Environment: `PRODUCTIVITY_DB=/path/to/file.db`, `PRODUCTIVITY_PORT=5055`.

Features the PWA has and this server does not: countdown timers (`planned_end`), UUID ids, merge
import. This server reads and writes version 1 backups with integer ids. A version 2 backup from the
PWA cannot be imported here; the PWA imports this server's exports.
