import os


def test_state_empty(client):
    r = client.get("/api/state")
    assert r.status_code == 200
    d = r.get_json()
    assert d["projects"] == []
    assert d["tasks"] == []
    assert d["running"] is None
    assert isinstance(d["now"], int)


def test_index_serves_page(client):
    r = client.get("/")
    assert r.status_code == 200
    assert b"<html" in r.data


# --- configuration: database path, migration, export filename, page title ---

def test_env_var_sets_db_path(tmp_path, monkeypatch):
    from app import create_app

    p = str(tmp_path / "from_env.db")
    monkeypatch.setenv("PRODUCTIVITY_DB", p)
    assert create_app().config["DB_PATH"] == p
    assert os.path.exists(p)


def test_default_db_name(tmp_path, monkeypatch):
    import app as m

    monkeypatch.delenv("PRODUCTIVITY_DB", raising=False)
    monkeypatch.setattr(m, "DEFAULT_DB_PATH", str(tmp_path / "productivity.db"))
    assert m.create_app().config["DB_PATH"].endswith("productivity.db")


def test_legacy_db_file_is_renamed(tmp_path):
    from app import create_app

    old = tmp_path / "amit.productivity.DB"
    old.write_bytes(b"")
    create_app(db_path=str(tmp_path / "productivity.db"))
    assert not old.exists()
    assert (tmp_path / "productivity.db").exists()


def test_legacy_db_not_touched_when_new_exists(tmp_path):
    import sqlite3

    from app import create_app

    new = tmp_path / "productivity.db"
    create_app(db_path=str(new))  # new file now exists
    old = tmp_path / "amit.productivity.DB"
    sqlite3.connect(old).close()  # valid empty database with the old name
    create_app(db_path=str(new))
    assert old.exists()


def test_export_filename(client):
    r = client.get("/api/export")
    assert r.status_code == 200
    assert "productivity-backup.json" in r.headers["Content-Disposition"]
    assert "amit" not in r.headers["Content-Disposition"]


def test_page_title(client):
    assert b"<title>Productivity Tracker</title>" in client.get("/").data


# --- input validation ---

def _project(client, name="P"):
    return client.post("/api/projects", json={"name": name}).get_json()


def test_create_task_unknown_project_is_404(client):
    assert client.post("/api/tasks", json={"name": "t", "project_id": 999}).status_code == 404


def test_create_record_unknown_project_is_404(client):
    assert client.post("/api/records", json={"project_id": 999, "start": 1, "end": 2}).status_code == 404


def test_create_record_task_from_other_project_is_400(client):
    p1, p2 = _project(client, "a"), _project(client, "b")
    t = client.post("/api/tasks", json={"name": "t", "project_id": p2["id"]}).get_json()
    r = client.post("/api/records", json={"project_id": p1["id"], "task_id": t["id"], "start": 1, "end": 2})
    assert r.status_code == 400


def test_update_record_unknown_project_is_404(client):
    p = _project(client)
    rec = client.post("/api/records", json={"project_id": p["id"], "start": 1, "end": 2}).get_json()
    assert client.put(f"/api/records/{rec['id']}", json={"project_id": 999}).status_code == 404


def test_update_record_task_from_other_project_is_400(client):
    p1, p2 = _project(client, "a"), _project(client, "b")
    t = client.post("/api/tasks", json={"name": "t", "project_id": p2["id"]}).get_json()
    rec = client.post("/api/records", json={"project_id": p1["id"], "start": 1, "end": 2}).get_json()
    assert client.put(f"/api/records/{rec['id']}", json={"task_id": t["id"]}).status_code == 400


def test_update_record_valid_task_ok(client):
    p = _project(client)
    t = client.post("/api/tasks", json={"name": "t", "project_id": p["id"]}).get_json()
    rec = client.post("/api/records", json={"project_id": p["id"], "start": 1, "end": 2}).get_json()
    r = client.put(f"/api/records/{rec['id']}", json={"task_id": t["id"]})
    assert r.status_code == 200 and r.get_json()["task_id"] == t["id"]


def test_timer_start_unknown_project_is_404(client):
    assert client.post("/api/timer/start", json={"project_id": 999}).status_code == 404


def test_bad_json_body_is_400(client):
    r = client.post("/api/projects", data="not json", content_type="application/json")
    assert r.status_code == 400


# --- backup export and import ---

def _seed(client):
    p = _project(client, "seed")
    t = client.post("/api/tasks", json={"name": "t", "project_id": p["id"]}).get_json()
    client.post("/api/records", json={"project_id": p["id"], "task_id": t["id"], "start": 100, "end": 200})
    client.post("/api/timer/start", json={"project_id": p["id"]})


def _snapshot(client):
    st = client.get("/api/state").get_json()
    return st["projects"], st["tasks"], client.get("/api/records").get_json()


def test_import_rejects_empty_and_keeps_data(client):
    _seed(client)
    before = _snapshot(client)
    assert client.post("/api/import", json={}).status_code == 400
    assert _snapshot(client) == before


def test_import_rejects_wrong_version(client):
    _seed(client)
    before = _snapshot(client)
    r = client.post("/api/import", json={"version": 2, "projects": [], "tasks": [], "records": []})
    assert r.status_code == 400
    assert _snapshot(client) == before


def test_import_rejects_missing_list(client):
    _seed(client)
    before = _snapshot(client)
    r = client.post("/api/import", json={"version": 1, "projects": [], "tasks": []})
    assert r.status_code == 400
    assert _snapshot(client) == before


def test_import_rejects_bad_row_and_keeps_data(client):
    _seed(client)
    before = _snapshot(client)
    bad = {"version": 1, "projects": [{"id": 1}], "tasks": [], "records": []}  # missing name
    assert client.post("/api/import", json=bad).status_code == 400
    assert _snapshot(client) == before


def test_export_import_roundtrip(tmp_path):
    from app import create_app

    a = create_app(db_path=str(tmp_path / "a.db")).test_client()
    _seed(a)
    dump = a.get("/api/export").get_json()
    assert dump["version"] == 1
    b = create_app(db_path=str(tmp_path / "b.db")).test_client()
    assert b.post("/api/import", json=dump).status_code == 200
    assert _snapshot(b) == _snapshot(a)


# --- CRUD and timer ---

def test_project_crud(client):
    assert client.post("/api/projects", json={"name": "  "}).status_code == 400
    p = _project(client, "A")
    r = client.put(f"/api/projects/{p['id']}", json={"name": "B", "archived": True})
    assert r.status_code == 200 and r.get_json()["name"] == "B" and r.get_json()["archived"] == 1
    assert client.put("/api/projects/999", json={"name": "x"}).status_code == 404
    assert client.delete(f"/api/projects/{p['id']}").status_code == 200
    assert client.get("/api/state").get_json()["projects"] == []


def test_task_crud_and_cascade(client):
    p = _project(client)
    assert client.post("/api/tasks", json={"name": "", "project_id": p["id"]}).status_code == 400
    t = client.post("/api/tasks", json={"name": "t", "project_id": p["id"]}).get_json()
    r = client.put(f"/api/tasks/{t['id']}", json={"completed": True})
    assert r.status_code == 200 and r.get_json()["completed"] == 1
    assert client.put("/api/tasks/999", json={"name": "x"}).status_code == 404
    client.delete(f"/api/projects/{p['id']}")
    assert client.get("/api/state").get_json()["tasks"] == []


def test_timer_start_replaces_running_and_stop_ends_it(client):
    p1, p2 = _project(client, "a"), _project(client, "b")
    client.post("/api/timer/start", json={"project_id": p1["id"]})
    r2 = client.post("/api/timer/start", json={"project_id": p2["id"]}).get_json()
    assert client.get("/api/state").get_json()["running"]["id"] == r2["id"]
    assert client.post("/api/timer/stop").status_code == 200
    assert client.get("/api/state").get_json()["running"] is None
    assert client.post("/api/timer/start", json={}).status_code == 400


def test_records_range_and_delete(client):
    p = _project(client)
    a = client.post("/api/records", json={"project_id": p["id"], "start": 100, "end": 200}).get_json()
    b = client.post("/api/records", json={"project_id": p["id"], "start": 300, "end": 400}).get_json()
    ids = [r["id"] for r in client.get("/api/records?from=250&to=500").get_json()]
    assert ids == [b["id"]]
    assert client.post("/api/records", json={"project_id": p["id"], "start": 5, "end": 5}).status_code == 400
    assert client.put(f"/api/records/{a['id']}", json={"end": 50}).status_code == 400
    assert client.put("/api/records/999", json={"end": 50}).status_code == 404
    assert client.delete(f"/api/records/{a['id']}").status_code == 200
    assert len(client.get("/api/records").get_json()) == 1


def test_each_app_has_own_db(tmp_path):
    from app import create_app

    a = create_app(db_path=str(tmp_path / "a.db")).test_client()
    b = create_app(db_path=str(tmp_path / "b.db")).test_client()
    a.post("/api/projects", json={"name": "only in a"})
    assert len(a.get("/api/state").get_json()["projects"]) == 1
    assert b.get("/api/state").get_json()["projects"] == []
    assert os.path.exists(tmp_path / "a.db")
