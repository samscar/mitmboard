import asyncio
import pytest
from fastapi.testclient import TestClient
from mitmboard.server import make_app
from mitmboard.store import FlowStore
from mitmboard.clients import ClientRegistry
from mitmboard.broadcaster import Broadcaster
from mitmboard.wsstore import WsStore
from tests.test_models import make_flow

def client(tmp_path):
    store = FlowStore()
    store.add(make_flow(id="a"))
    reg = ClientRegistry(tmp_path / "c.json")
    return TestClient(make_app(store, reg, Broadcaster())), store, reg

def test_list_and_detail(tmp_path):
    c, _, _ = client(tmp_path)
    lst = c.get("/api/flows").json()
    assert lst[0]["id"] == "a" and "body" not in lst[0]["request"]
    detail = c.get("/api/flows/a").json()
    assert detail["response"]["body"] == '{"ok":true}'
    assert c.get("/api/flows/missing").status_code == 404

def test_clear_and_clients_and_labels(tmp_path):
    c, store, reg = client(tmp_path)
    assert c.get("/api/clients").json()[0]["count"] == 1
    c.put("/api/clients/192.168.1.23", json={"label": "My iPhone"})
    assert reg.all_labels()["192.168.1.23"] == "My iPhone"
    c.delete("/api/flows")
    assert c.get("/api/flows").json() == []


def test_clear_uses_provided_hook_instead_of_bare_store_clear(tmp_path):
    # DELETE /api/flows must go through the addon's own clear hook (which also
    # drops breakpoint bookkeeping like `_modified`), not call store.clear()
    # directly -- otherwise addon-side state tied to cleared flows leaks.
    store = FlowStore(); store.add(make_flow(id="a"))
    reg = ClientRegistry(tmp_path / "c.json")
    calls = []
    def on_clear():
        calls.append(1)
        store.clear()
    c = TestClient(make_app(store, reg, Broadcaster(), on_clear=on_clear))
    c.delete("/api/flows")
    assert calls == [1]
    assert c.get("/api/flows").json() == []

def test_clear_runs_on_the_event_loop(tmp_path):
    # DELETE /api/flows must run on the event loop: on_clear (Mitmboard.clear)
    # calls self._publish(...) -> asyncio.ensure_future(...) whenever a flow
    # is paused at clear time, which raises RuntimeError with no running
    # loop (i.e. in a threadpool-worker sync handler).
    store = FlowStore(); store.add(make_flow(id="a"))
    reg = ClientRegistry(tmp_path / "c.json")
    calls = []
    def on_clear():
        asyncio.get_running_loop()
        calls.append(1)
        store.clear()
    c = TestClient(make_app(store, reg, Broadcaster(), on_clear=on_clear),
                   raise_server_exceptions=False)
    resp = c.delete("/api/flows")
    assert resp.status_code == 200
    assert calls == [1]
    assert c.get("/api/flows").json() == []

def test_connect_info(tmp_path):
    c, _, _ = client(tmp_path)
    info = c.get("/api/connect-info").json()
    assert info["proxy_port"] == 8080
    assert "lan_ips" in info and "cert_url" in info

def test_detail_includes_top_level_duration(tmp_path):
    c, _, _ = client(tmp_path)  # existing helper; make_flow has timing.duration_ms=142
    detail = c.get("/api/flows/a").json()
    assert detail["duration_ms"] == 142

def test_session_download_and_load(tmp_path):
    c, store, _ = client(tmp_path)          # store seeded with flow "a"
    dl = c.get("/api/session")
    assert dl.headers["content-disposition"].startswith("attachment")
    body = dl.json()
    assert body[0]["response"]["body"] == '{"ok":true}'
    c.delete("/api/flows")                    # empty it
    assert c.get("/api/flows").json() == []
    r = c.post("/api/session", json=body)
    assert r.json() == {"loaded": 1}
    assert c.get("/api/flows").json()[0]["id"] == "a"

def test_har_export_endpoint(tmp_path):
    c, _, _ = client(tmp_path)
    r = c.get("/api/export/har")
    assert r.headers["content-disposition"].startswith("attachment")
    assert r.json()["log"]["entries"][0]["request"]["method"] == "GET"

def test_ca_info_endpoint(tmp_path):
    c, _, _ = client(tmp_path)
    info = c.get("/api/ca-info").json()
    assert "present" in info and info["cert_url"] == "http://mitm.it"

def test_replay_endpoint(tmp_path):
    from mitmboard.server import make_app
    from mitmboard.store import FlowStore
    from mitmboard.clients import ClientRegistry
    from mitmboard.broadcaster import Broadcaster
    store = FlowStore(); store.add(make_flow(id="a"))
    seen = []
    def replayer(fid): seen.append(fid); return fid == "a"
    c = TestClient(make_app(store, ClientRegistry(tmp_path/"c.json"), Broadcaster(), replayer=replayer))
    assert c.post("/api/flows/a/replay").json() == {"ok": True}
    assert seen == ["a"]
    assert c.post("/api/flows/missing/replay").status_code == 404

def test_replay_503_without_replayer(tmp_path):
    c, _, _ = client(tmp_path)   # make_app built without replayer
    assert c.post("/api/flows/a/replay").status_code == 503

def test_replay_edited_endpoint(tmp_path):
    store = FlowStore(); store.add(make_flow(id="a"))
    seen = []
    def edited(fid, edits): seen.append((fid, edits)); return fid == "a"
    c = TestClient(make_app(store, ClientRegistry(tmp_path/"c.json"), Broadcaster(),
                            edited_replayer=edited))
    body = {"method": "POST", "url": "http://x/y", "headers": [["h", "v"]], "body": "{}"}
    assert c.post("/api/flows/a/replay-edited", json=body).json() == {"ok": True}
    assert seen[0][0] == "a"
    assert seen[0][1] == {"method": "POST", "url": "http://x/y",
                          "headers": [("h", "v")], "body": "{}"}
    assert c.post("/api/flows/missing/replay-edited", json={}).status_code == 404

def test_replay_edited_drops_none_fields(tmp_path):
    store = FlowStore(); store.add(make_flow(id="a"))
    captured = {}
    def edited(fid, edits): captured.update(edits); return True
    c = TestClient(make_app(store, ClientRegistry(tmp_path/"c.json"), Broadcaster(),
                            edited_replayer=edited))
    c.post("/api/flows/a/replay-edited", json={"method": "PUT"})
    assert captured == {"method": "PUT"}   # url/headers/body omitted, not sent as None

def test_replay_edited_503_without_replayer(tmp_path):
    c, _, _ = client(tmp_path)
    assert c.post("/api/flows/a/replay-edited", json={}).status_code == 503

def test_ssl_proxying_default_without_saved_state(tmp_path):
    c, _, _ = client(tmp_path)
    assert c.get("/api/ssl-proxying").json() == {"enabled": True, "exclude": [], "base": []}

def test_ssl_proxying_get_reports_captured_baseline(tmp_path):
    reg = ClientRegistry(tmp_path / "c.json")
    c = TestClient(make_app(FlowStore(), reg, Broadcaster(),
                            ssl_proxying_state=lambda: {
                                "enabled": True, "exclude": [], "base": ["^config-yaml:443$"]}))
    assert c.get("/api/ssl-proxying").json() == {
        "enabled": True, "exclude": [], "base": ["^config-yaml:443$"]}

def test_ssl_proxying_put_roundtrip_and_publish(tmp_path):
    reg = ClientRegistry(tmp_path / "c.json")
    published = []
    bc = Broadcaster()
    async def fake_publish(evt): published.append(evt)
    bc.publish = fake_publish
    applied = {}
    def fake_apply(data):
        applied.clear()
        applied.update({**data, "base": ["^config-yaml:443$"]})
        return applied
    c = TestClient(make_app(FlowStore(), reg, bc,
                            ssl_proxying_apply=fake_apply,
                            ssl_proxying_state=lambda: applied))
    r = c.put("/api/ssl-proxying", json={"enabled": False, "exclude": ["*.example.com"]})
    assert r.status_code == 200
    assert r.json() == {"enabled": False, "exclude": ["*.example.com"], "base": ["^config-yaml:443$"]}
    assert reg.ssl_proxying() == {"enabled": False, "exclude": ["*.example.com"]}
    assert applied == {"enabled": False, "exclude": ["*.example.com"], "base": ["^config-yaml:443$"]}
    assert published[-1]["type"] == "sslproxying.update"
    assert published[-1]["base"] == ["^config-yaml:443$"]
    assert c.get("/api/ssl-proxying").json() == {
        "enabled": False, "exclude": ["*.example.com"], "base": ["^config-yaml:443$"]}

def test_ssl_proxying_put_invalid_pattern_422(tmp_path):
    c, _, _ = client(tmp_path)
    assert c.put("/api/ssl-proxying", json={"enabled": True, "exclude": ["   "]}).status_code == 422
    assert c.put("/api/ssl-proxying", json={"enabled": True, "exclude": [3]}).status_code == 422

def test_ssl_proxying_put_apply_failure_503(tmp_path):
    def boom(_data):
        raise RuntimeError("no proxy master")
    c = TestClient(make_app(FlowStore(), ClientRegistry(tmp_path / "c.json"), Broadcaster(),
                            ssl_proxying_apply=boom))
    r = c.put("/api/ssl-proxying", json={"enabled": True, "exclude": ["x.example.com"]})
    assert r.status_code == 503

def test_breakpoints_crud_and_validation(tmp_path):
    c, _, reg = client(tmp_path)
    assert c.get("/api/breakpoints").json() == {"enabled": True, "rules": []}
    body = {"enabled": True, "rules": [{"id": "r1", "host": "*.soum.sa", "phase": "request"}]}
    assert c.put("/api/breakpoints", json=body).json()["rules"][0]["method"] == ""
    assert reg.breakpoints()["rules"][0]["id"] == "r1"
    assert c.put("/api/breakpoints", json={"enabled": True, "rules": [{"id": "x", "phase": "bad"}]}).status_code == 422

def test_paused_endpoints(tmp_path):
    from mitmboard.breakpoints import BreakpointEngine
    calls = {}
    eng = BreakpointEngine(lambda: {"enabled": True, "rules": []})
    store = FlowStore(); store.add(make_flow(id="p", state="paused_request"))
    class F:  # minimal flow stand-in for the engine
        id = "p"; killable = True; is_replay = False
        def intercept(self): pass
        def resume(self): pass
        def kill(self): pass
    eng.pause(F(), "request", None)
    def resume(fid, edits):
        if eng.get(fid) is None:
            return None
        calls["resume"] = (fid, edits); return {"flow_id": fid, "modified": bool(edits)}
    def drop(fid):
        if eng.get(fid) is None:
            return None
        calls["drop"] = fid; return {"flow_id": fid}
    reg = ClientRegistry(tmp_path / "c.json")
    c = TestClient(make_app(store, reg, Broadcaster(), breakpoints=eng, resume_paused=resume, drop_paused=drop))
    lst = c.get("/api/paused").json()
    assert lst[0]["flow_id"] == "p" and lst[0]["flow"]["id"] == "p" and lst[0]["phase"] == "request"
    assert c.post("/api/paused/p/resume", json={"headers": [["a", "b"]]}).json() == {"ok": True, "modified": True}
    assert calls["resume"] == ("p", {"headers": [["a", "b"]]})
    assert c.post("/api/paused/nope/resume").status_code == 404
    assert c.post("/api/paused/p/drop").json() == {"ok": True} and calls["drop"] == "p"

def _paused_client(tmp_path, **kwargs):
    from mitmboard.breakpoints import BreakpointEngine
    eng = BreakpointEngine(lambda: {"enabled": True, "rules": []})
    store = FlowStore(); store.add(make_flow(id="p", state="paused_request"))
    class F:  # minimal flow stand-in for the engine
        id = "p"; killable = True; is_replay = False
        def intercept(self): pass
        def resume(self): pass
        def kill(self): pass
    eng.pause(F(), "request", None)
    reg = ClientRegistry(tmp_path / "c.json")
    app = make_app(store, reg, Broadcaster(), breakpoints=eng, **kwargs)
    return TestClient(app, raise_server_exceptions=False)

def test_resume_runs_on_the_event_loop(tmp_path):
    # resume_paused is invoked from the endpoint handler; it must see a running
    # event loop (mitmproxy's flow.resume()/publish() are not thread-safe and
    # asyncio.ensure_future requires one) rather than a threadpool worker thread.
    def resume_paused(fid, edits):
        asyncio.get_running_loop()
        return {"flow_id": "p", "modified": False}

    c = _paused_client(tmp_path, resume_paused=resume_paused)
    resp = c.post("/api/paused/p/resume")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True, "modified": False}

def test_drop_runs_on_the_event_loop(tmp_path):
    def drop_paused(fid):
        asyncio.get_running_loop()
        return {"flow_id": "p"}

    c = _paused_client(tmp_path, drop_paused=drop_paused)
    resp = c.post("/api/paused/p/drop")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}

def test_ws_messages_endpoint(tmp_path):
    store = FlowStore(); store.add(make_flow(id="w", kind="ws", ws={"messages": 0, "open": True}))
    ws = WsStore(); ws.append("w", True, True, b"hello", 1.0); ws.append("w", False, True, b"world", 2.0)
    c = TestClient(make_app(store, ClientRegistry(tmp_path / "c.json"), Broadcaster(), wsstore=ws))
    body = c.get("/api/flows/w/ws").json()
    assert body["total"] == 2 and [m["text"] for m in body["messages"]] == ["hello", "world"]
    assert c.get("/api/flows/w/ws?after=0").json()["messages"][0]["i"] == 1
    assert c.get("/api/flows/nope/ws").status_code == 404
    store.add(make_flow(id="h")); assert c.get("/api/flows/h/ws").json() == {"messages": [], "total": 0}

async def test_ws_loop_unregisters_on_non_disconnect_error():
    # The /ws route must drop a socket from the broadcaster even when it
    # dies some way other than WebSocketDisconnect -- otherwise it lingers
    # in the broadcaster set and client_count() stays > 0 with no live UI,
    # which can make a breakpoint rule pause a request nobody will ever see.
    from mitmboard.server import _run_ws_loop

    class FakeSock:
        async def receive_text(self):
            raise RuntimeError("socket died some other way")

    bc = Broadcaster()
    sock = FakeSock()
    await bc.register(sock)
    assert bc.client_count() == 1
    with pytest.raises(RuntimeError):
        await _run_ws_loop(sock, bc)
    assert bc.client_count() == 0

async def test_ws_loop_swallows_cancellation():
    # CancelledError is a BaseException, so it escapes FastAPI/Starlette's
    # `except Exception` layers and reaches uvicorn's wsproto handler, which
    # logs the whole traceback as "Exception in ASGI application". A cancelled
    # /ws task must exit quietly and still unregister its socket.
    from mitmboard.server import _run_ws_loop

    class FakeSock:
        async def receive_text(self):
            raise asyncio.CancelledError()

    bc = Broadcaster()
    sock = FakeSock()
    await bc.register(sock)
    await _run_ws_loop(sock, bc)          # must not raise
    assert bc.client_count() == 0

async def test_done_stops_server_and_drains_background_tasks(tmp_path, monkeypatch):
    # master.run()'s finally awaits addon hooks before asyncio.run() cancels
    # whatever is left. `done()` must request shutdown, await serve(), and
    # cancel + await the sweep task.
    import mitmboard.addon as addon_mod
    monkeypatch.setattr(addon_mod, "config_path", lambda: tmp_path / "config.json")

    addon = addon_mod.Mitmboard()
    served, swept = [], []

    class FakeServer:
        should_exit = False

    async def serve():
        await asyncio.sleep(0)
        served.append(True)

    async def sweep():
        try:
            await asyncio.sleep(100)
        finally:
            swept.append(True)

    addon._server = FakeServer()
    addon._serve_task = asyncio.ensure_future(serve())
    addon._sweep_task = asyncio.ensure_future(sweep())
    await asyncio.sleep(0)                    # let both coroutines start
    await addon.done()
    assert addon._server.should_exit is True
    assert addon._serve_task.done() and served == [True]
    assert addon._sweep_task.done() and addon._sweep_task.cancelled()
    assert swept == [True]

async def test_done_is_a_noop_before_running(tmp_path, monkeypatch):
    # Startup can fail before the `running` hook ever booted uvicorn.
    import mitmboard.addon as addon_mod
    monkeypatch.setattr(addon_mod, "config_path", lambda: tmp_path / "config.json")
    await addon_mod.Mitmboard().done()

async def test_publish_done_callback_ignores_cancelled(tmp_path, monkeypatch):
    # Future.exception() raises CancelledError on a cancelled future. In-flight
    # publishes are cancelled on every shutdown, so the callback must skip them.
    import mitmboard.addon as addon_mod
    monkeypatch.setattr(addon_mod, "config_path", lambda: tmp_path / "config.json")
    errors = []
    monkeypatch.setattr(addon_mod._log, "error", lambda *a, **kw: errors.append(a))

    addon = addon_mod.Mitmboard()

    async def cancelled_publish(event):
        raise asyncio.CancelledError()

    addon.broadcaster.publish = cancelled_publish
    addon._publish({"type": "flow.update"})
    for _ in range(3):
        await asyncio.sleep(0)
    assert errors == []
