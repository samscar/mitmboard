"""The Map Local HTTP seam: uploads, "save captured response", sweep on save.

Everything here drives the app the way the browser does -- no direct calls into
the engine or the managed-directory helpers.
"""
import os
import time
from pathlib import Path

from fastapi.testclient import TestClient

from mitmboard.broadcaster import Broadcaster
from mitmboard.clients import ClientRegistry
from mitmboard.managed import MAX_FILE_BYTES, ManagedFileTooLarge, store_bytes
from mitmboard.server import make_app
from mitmboard.store import FlowStore
from tests.test_models import make_flow


def _client(tmp_path, **kwargs):
    store = FlowStore()
    store.add(make_flow(id="a"))
    reg = ClientRegistry(tmp_path / "c.json")
    root = tmp_path / "maplocal"
    return TestClient(make_app(store, reg, Broadcaster(), maplocal_dir=root, **kwargs)), root


def _upload(client, name: str, body: bytes):
    return client.post("/api/maplocal/files", params={"filename": name}, content=body)


def test_upload_lands_in_the_managed_dir_keyed_by_content(tmp_path):
    c, root = _client(tmp_path)
    first = _upload(c, "mock.json", b'{"ok":true}')
    assert first.status_code == 200
    path = Path(first.json()["path"])
    assert path.parent == root
    assert path.read_bytes() == b'{"ok":true}'
    assert path.suffix == ".json"
    assert first.json()["size"] == 11


def test_uploading_the_same_body_twice_keeps_one_copy(tmp_path):
    c, root = _client(tmp_path)
    a = _upload(c, "mock.json", b'{"ok":true}').json()["path"]
    b = _upload(c, "renamed.json", b'{"ok":true}').json()["path"]
    assert a == b
    assert len(list(root.iterdir())) == 1


def test_upload_over_the_limit_is_rejected_with_422(tmp_path):
    c, root = _client(tmp_path)
    resp = _upload(c, "big.bin", b"x" * (MAX_FILE_BYTES + 1))
    assert resp.status_code == 422
    assert not root.exists() or list(root.iterdir()) == []


def test_upload_is_unavailable_without_a_managed_dir(tmp_path):
    store = FlowStore()
    reg = ClientRegistry(tmp_path / "c.json")
    c = TestClient(make_app(store, reg, Broadcaster()))
    assert _upload(c, "a.json", b"1").status_code == 503


def test_save_captured_response_returns_the_written_path(tmp_path):
    saved = {"path": "/tmp/maplocal/abc.json", "size": 12}
    c, _ = _client(tmp_path, save_response_file=lambda fid: saved if fid == "a" else None)
    assert c.post("/api/flows/a/maplocal-file").json() == saved
    assert c.post("/api/flows/missing/maplocal-file").status_code == 404


def test_save_captured_response_reports_oversize_as_422(tmp_path):
    def too_big(_fid):
        raise ManagedFileTooLarge(MAX_FILE_BYTES + 1)

    c, _ = _client(tmp_path, save_response_file=too_big)
    assert c.post("/api/flows/a/maplocal-file").status_code == 422


def test_save_captured_response_is_unavailable_without_a_callback(tmp_path):
    c, _ = _client(tmp_path)
    assert c.post("/api/flows/a/maplocal-file").status_code == 503


def _age(path: Path, seconds: int) -> None:
    stamp = time.time() - seconds
    os.utime(path, (stamp, stamp))


def test_saving_rules_sweeps_unreferenced_managed_files(tmp_path):
    c, root = _client(tmp_path)
    kept = store_bytes(root, b"kept", ".json")
    gone = store_bytes(root, b"gone", ".json")
    _age(kept, 3600)
    _age(gone, 3600)

    body = {"enabled": True, "rules": [
        {"id": "r1", "host": "api.example.com", "path": "/*", "file": str(kept)}]}
    assert c.put("/api/maplocal", json=body).status_code == 200

    assert kept.exists()
    assert not gone.exists()


def test_saving_rules_never_touches_a_path_outside_the_managed_dir(tmp_path):
    c, root = _client(tmp_path)
    mine = tmp_path / "mine.json"
    mine.write_text("mine", encoding="utf-8")
    _age(mine, 3600)
    store_bytes(root, b"managed", ".json")
    _age(next(root.iterdir()), 3600)

    body = {"enabled": True, "rules": [
        {"id": "r1", "host": "api.example.com", "path": "/*", "file": str(mine)}]}
    assert c.put("/api/maplocal", json=body).status_code == 200
    assert mine.exists()


def test_saving_rules_leaves_fresh_uploads_alone(tmp_path):
    # A dialog that uploaded but has not saved yet must not lose its file to
    # another tab's save.
    c, root = _client(tmp_path)
    fresh = store_bytes(root, b"fresh", ".json")

    c.put("/api/maplocal", json={"enabled": True, "rules": []})

    assert fresh.exists()


def test_flows_expose_the_map_local_hit(tmp_path):
    store = FlowStore()
    store.add(make_flow(id="hit", maplocal_rule_id="r1", maplocal_file="/tmp/mock.json"))
    reg = ClientRegistry(tmp_path / "c.json")
    c = TestClient(make_app(store, reg, Broadcaster()))

    assert c.get("/api/flows").json()[0]["maplocal_rule_id"] == "r1"
    detail = c.get("/api/flows/hit").json()
    assert detail["maplocal_rule_id"] == "r1"
    assert detail["maplocal_file"] == "/tmp/mock.json"
