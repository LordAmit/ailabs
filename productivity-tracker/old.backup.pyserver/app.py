"""Productivity Tracker: local time tracker. Single-user, no accounts, SQLite on disk.

Run:  python app.py   (then open http://127.0.0.1:5055)
Env:  PRODUCTIVITY_DB=/path/to/file.db   PRODUCTIVITY_PORT=5055
"""
import json
import mimetypes
import os
import sqlite3
import time

from flask import Blueprint, Flask, abort, current_app, g, jsonify, request, send_from_directory

mimetypes.add_type("application/manifest+json", ".webmanifest")

BASE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB_PATH = os.path.join(BASE, "productivity.db")
LEGACY_DB_NAME = "amit.productivity.DB"  # name used before 2026-10-15

bp = Blueprint("main", __name__)

SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    start INTEGER NOT NULL,
    end INTEGER
);
CREATE INDEX IF NOT EXISTS idx_records_start ON records(start);
"""


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(current_app.config["DB_PATH"])
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def migrate_legacy_db(db_path):
    """Rename an old-named database next to `db_path` if the new file does not exist yet."""
    old = os.path.join(os.path.dirname(os.path.abspath(db_path)), LEGACY_DB_NAME)
    if os.path.exists(old) and not os.path.exists(db_path):
        os.rename(old, db_path)
        print(f"Renamed {old} -> {db_path}")


def init_db(db_path):
    migrate_legacy_db(db_path)
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()


def rows(cur):
    return [dict(r) for r in cur.fetchall()]


def now():
    return int(time.time())


def body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        abort(400, "JSON body required")
    return data


def as_int(v, default=None):
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def check_project_task(db, pid, tid=None):
    """404 if the project does not exist, 400 if the task is not in that project."""
    if not db.execute("SELECT 1 FROM projects WHERE id=?", (pid,)).fetchone():
        abort(404, "project not found")
    if tid is not None and not db.execute("SELECT 1 FROM tasks WHERE id=? AND project_id=?", (tid, pid)).fetchone():
        abort(400, "task does not belong to project")


# ---------- pages ----------

@bp.get("/")
def index():
    # web/ is plain static files so the same folder can be hosted on GitHub Pages.
    return send_from_directory(current_app.static_folder, "index.html")


# ---------- state ----------

@bp.get("/api/state")
def api_state():
    db = get_db()
    return jsonify(
        projects=rows(db.execute("SELECT * FROM projects ORDER BY archived, name COLLATE NOCASE")),
        tasks=rows(db.execute("SELECT * FROM tasks ORDER BY completed, created DESC")),
        running=running_record(db),
        now=now(),
    )


def running_record(db):
    r = db.execute("SELECT * FROM records WHERE end IS NULL ORDER BY start DESC LIMIT 1").fetchone()
    return dict(r) if r else None


# ---------- projects ----------

@bp.post("/api/projects")
def create_project():
    d = body()
    name = (d.get("name") or "").strip()
    if not name:
        abort(400, "name required")
    color = d.get("color") or "#4f8cff"
    db = get_db()
    cur = db.execute("INSERT INTO projects(name, color, created) VALUES (?,?,?)", (name, color, now()))
    db.commit()
    return jsonify(dict(db.execute("SELECT * FROM projects WHERE id=?", (cur.lastrowid,)).fetchone()))


@bp.put("/api/projects/<int:pid>")
def update_project(pid):
    d = body()
    db = get_db()
    row = db.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
    if not row:
        abort(404)
    name = (d.get("name") or row["name"]).strip() or row["name"]
    color = d.get("color") or row["color"]
    archived = 1 if d.get("archived", row["archived"]) else 0
    db.execute("UPDATE projects SET name=?, color=?, archived=? WHERE id=?", (name, color, archived, pid))
    db.commit()
    return jsonify(dict(db.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()))


@bp.delete("/api/projects/<int:pid>")
def delete_project(pid):
    db = get_db()
    db.execute("DELETE FROM projects WHERE id=?", (pid,))
    db.commit()
    return jsonify(ok=True)


# ---------- tasks ----------

@bp.post("/api/tasks")
def create_task():
    d = body()
    name = (d.get("name") or "").strip()
    pid = as_int(d.get("project_id"))
    if not name or pid is None:
        abort(400, "name and project_id required")
    db = get_db()
    check_project_task(db, pid)
    cur = db.execute("INSERT INTO tasks(project_id, name, created) VALUES (?,?,?)", (pid, name, now()))
    db.commit()
    return jsonify(dict(db.execute("SELECT * FROM tasks WHERE id=?", (cur.lastrowid,)).fetchone()))


@bp.put("/api/tasks/<int:tid>")
def update_task(tid):
    d = body()
    db = get_db()
    row = db.execute("SELECT * FROM tasks WHERE id=?", (tid,)).fetchone()
    if not row:
        abort(404)
    name = (d.get("name") or row["name"]).strip() or row["name"]
    completed = 1 if d.get("completed", row["completed"]) else 0
    db.execute("UPDATE tasks SET name=?, completed=? WHERE id=?", (name, completed, tid))
    db.commit()
    return jsonify(dict(db.execute("SELECT * FROM tasks WHERE id=?", (tid,)).fetchone()))


@bp.delete("/api/tasks/<int:tid>")
def delete_task(tid):
    db = get_db()
    db.execute("DELETE FROM tasks WHERE id=?", (tid,))
    db.commit()
    return jsonify(ok=True)


# ---------- timer ----------

@bp.post("/api/timer/start")
def timer_start():
    d = body()
    pid = as_int(d.get("project_id"))
    tid = as_int(d.get("task_id"))
    if pid is None:
        abort(400, "project_id required")
    db = get_db()
    check_project_task(db, pid, tid)
    t = now()
    db.execute("UPDATE records SET end=? WHERE end IS NULL", (t,))
    cur = db.execute("INSERT INTO records(project_id, task_id, start) VALUES (?,?,?)", (pid, tid, t))
    db.commit()
    return jsonify(dict(db.execute("SELECT * FROM records WHERE id=?", (cur.lastrowid,)).fetchone()))


@bp.post("/api/timer/stop")
def timer_stop():
    db = get_db()
    t = now()
    db.execute("UPDATE records SET end=? WHERE end IS NULL", (t,))
    # drop zero-length records produced by instant stops
    db.execute("DELETE FROM records WHERE end IS NOT NULL AND end <= start")
    db.commit()
    return jsonify(ok=True, now=t)


# ---------- records ----------

@bp.get("/api/records")
def list_records():
    """Records overlapping [from, to). Running record included if it started before `to`."""
    f = as_int(request.args.get("from"), 0)
    t = as_int(request.args.get("to"), now() + 86400)
    db = get_db()
    return jsonify(rows(db.execute(
        "SELECT * FROM records WHERE start < ? AND (end IS NULL OR end > ?) ORDER BY start DESC",
        (t, f),
    )))


@bp.post("/api/records")
def create_record():
    d = body()
    pid = as_int(d.get("project_id"))
    tid = as_int(d.get("task_id"))
    start = as_int(d.get("start"))
    end = as_int(d.get("end"))
    if pid is None or start is None or end is None or end <= start:
        abort(400, "project_id, start, end required and end > start")
    db = get_db()
    check_project_task(db, pid, tid)
    cur = db.execute("INSERT INTO records(project_id, task_id, start, end) VALUES (?,?,?,?)", (pid, tid, start, end))
    db.commit()
    return jsonify(dict(db.execute("SELECT * FROM records WHERE id=?", (cur.lastrowid,)).fetchone()))


@bp.put("/api/records/<int:rid>")
def update_record(rid):
    d = body()
    db = get_db()
    row = db.execute("SELECT * FROM records WHERE id=?", (rid,)).fetchone()
    if not row:
        abort(404)
    pid = as_int(d.get("project_id"), row["project_id"])
    tid = as_int(d.get("task_id"), None) if "task_id" in d else row["task_id"]
    start = as_int(d.get("start"), row["start"])
    end = as_int(d.get("end"), row["end"]) if "end" in d else row["end"]
    if end is not None and end <= start:
        abort(400, "end must be after start")
    check_project_task(db, pid, tid)
    db.execute("UPDATE records SET project_id=?, task_id=?, start=?, end=? WHERE id=?", (pid, tid, start, end, rid))
    db.commit()
    return jsonify(dict(db.execute("SELECT * FROM records WHERE id=?", (rid,)).fetchone()))


@bp.delete("/api/records/<int:rid>")
def delete_record(rid):
    db = get_db()
    db.execute("DELETE FROM records WHERE id=?", (rid,))
    db.commit()
    return jsonify(ok=True)


# ---------- backup ----------

@bp.get("/api/export")
def export_data():
    db = get_db()
    payload = {
        "version": 1,
        "exported": now(),
        "projects": rows(db.execute("SELECT * FROM projects")),
        "tasks": rows(db.execute("SELECT * FROM tasks")),
        "records": rows(db.execute("SELECT * FROM records")),
    }
    resp = current_app.response_class(json.dumps(payload, indent=1), mimetype="application/json")
    resp.headers["Content-Disposition"] = "attachment; filename=productivity-backup.json"
    return resp


@bp.post("/api/import")
def import_data():
    d = body()
    if d.get("version") != 1:
        abort(400, "import failed: expected a version 1 backup")
    for key in ("projects", "tasks", "records"):
        if not isinstance(d.get(key), list):
            abort(400, f"import failed: '{key}' list missing")
    db = get_db()
    try:
        db.execute("DELETE FROM records")
        db.execute("DELETE FROM tasks")
        db.execute("DELETE FROM projects")
        for p in d.get("projects", []):
            db.execute("INSERT INTO projects(id,name,color,archived,created) VALUES (?,?,?,?,?)",
                       (p["id"], p["name"], p.get("color", "#4f8cff"), int(bool(p.get("archived", 0))), p.get("created", now())))
        for t in d.get("tasks", []):
            db.execute("INSERT INTO tasks(id,project_id,name,completed,created) VALUES (?,?,?,?,?)",
                       (t["id"], t["project_id"], t["name"], int(bool(t.get("completed", 0))), t.get("created", now())))
        for r in d.get("records", []):
            db.execute("INSERT INTO records(id,project_id,task_id,start,end) VALUES (?,?,?,?,?)",
                       (r["id"], r["project_id"], r.get("task_id"), r["start"], r.get("end")))
        db.commit()
    except (KeyError, sqlite3.Error) as e:
        db.rollback()
        abort(400, f"import failed: {e}")
    return jsonify(ok=True)


def create_app(db_path=None):
    """Build the app. `db_path` defaults to the env var, then to a file next to this script."""
    # The frontend is the repository root, one level up; this server is archived.
    app = Flask(__name__, static_folder=os.path.abspath(os.path.join(BASE, "..")), static_url_path="")
    app.config["DB_PATH"] = db_path or os.environ.get("PRODUCTIVITY_DB", DEFAULT_DB_PATH)
    app.register_blueprint(bp)
    app.teardown_appcontext(close_db)
    init_db(app.config["DB_PATH"])
    return app


if __name__ == "__main__":
    # 5055 rather than Flask's usual 5000: macOS AirPlay Receiver listens on 5000.
    port = int(os.environ.get("PRODUCTIVITY_PORT", "5055"))
    create_app().run(host="127.0.0.1", port=port, debug=False)
