from types import SimpleNamespace
from mitmproxy.test import taddons, tflow
from mitmboard.addon import Mitmboard


async def test_response_hook_records_and_publishes():
    addon = Mitmboard()
    published = []
    async def fake_publish(evt): published.append(evt)
    addon.broadcaster.publish = fake_publish
    with taddons.context(addon):
        f = tflow.tflow(resp=True)
        f.client_conn.peername = ("10.0.0.5", 5000)
        addon.response(f)
        # drain the scheduled publish
        await addon._flush_for_test()
    assert len(addon.store) == 1
    assert published[-1]["type"] == "flow.complete"
    assert published[-1]["flow"]["client"]["ip"] == "10.0.0.5"


async def test_error_hook_records_and_publishes():
    addon = Mitmboard()
    published = []
    async def fake_publish(evt): published.append(evt)
    addon.broadcaster.publish = fake_publish
    with taddons.context(addon):
        f = tflow.tflow(err=True)
        f.client_conn.peername = ("10.0.0.5", 5000)
        addon.error(f)
        # drain the scheduled publish
        await addon._flush_for_test()
    assert len(addon.store) == 1
    assert published[-1]["type"] == "flow.error"


async def test_retains_mflow_and_replays():
    addon = Mitmboard()
    async def noop(evt): pass
    addon.broadcaster.publish = noop
    with taddons.context(addon) as tctx:
        calls = []
        # stub the command dispatcher so no real proxy is needed
        tctx.master.commands.call = lambda name, args: calls.append((name, args))
        f = tflow.tflow(resp=True)
        f.client_conn.peername = ("10.0.0.5", 5000)
        addon.response(f)
        await addon._flush_for_test()
        fid = f.id
        assert addon.replay(fid) is True
        assert calls and calls[0][0] == "replay.client"
        assert addon.replay("nope") is False

async def test_request_hook_streams_pending_then_completes_in_place():
    addon = Mitmboard()
    published = []
    async def fake_publish(evt): published.append(evt)
    addon.broadcaster.publish = fake_publish
    from mitmproxy.test import tutils
    with taddons.context(addon):
        f = tflow.tflow()                    # request only, no response yet
        f.client_conn.peername = ("10.0.0.9", 5000)
        addon.request(f)                     # pending row streamed on request start
        await addon._flush_for_test()
        assert published[-1]["type"] == "flow.new"
        assert published[-1]["flow"]["state"] == "pending"
        assert len(addon.store) == 1
        f.response = tutils.tresp(status_code=200)
        addon.response(f)                    # same id completes
        await addon._flush_for_test()
        assert published[-1]["type"] == "flow.complete"
        assert len(addon.store) == 1          # updated in place, not duplicated

async def test_replay_edited_applies_edits_to_a_clone():
    addon = Mitmboard()
    async def noop(evt): pass
    addon.broadcaster.publish = noop
    with taddons.context(addon) as tctx:
        replayed = []
        tctx.master.commands.call = lambda name, args: replayed.append((name, args))
        f = tflow.tflow(resp=True)
        f.client_conn.peername = ("10.0.0.5", 5000)
        addon.response(f)
        await addon._flush_for_test()
        edits = {"method": "POST", "url": "http://edited.test/new",
                 "headers": [["X-Test", "1"]], "body": "hello"}
        assert addon.replay_edited(f.id, edits) is True
        assert addon.replay_edited("nope", edits) is False
        name, args = replayed[0]
        assert name == "replay.client"
        clone = args[0]
        assert clone.id != f.id                     # fresh flow, not the original
        assert clone.request.method == "POST"
        assert clone.request.url == "http://edited.test/new"
        assert clone.request.headers["X-Test"] == "1"
        assert clone.request.text == "hello"
        assert clone.response is None
        assert f.request.method == "GET"            # original untouched

async def test_apply_ssl_proxying_sets_ignore_hosts_option():
    addon = Mitmboard()
    with taddons.context(addon) as tctx:
        addon.apply_ssl_proxying({"enabled": True, "exclude": ["*.example.com", "10.0.0.5"]})
        assert list(tctx.options.ignore_hosts) == [
            r"^.*\.example\.com(:\d+)?$",   # '*' -> '.*', anchored, port optional
            r"^10\.0\.0\.5(:\d+)?$",
        ]
        assert addon.sslproxy.exclude == ["*.example.com", "10.0.0.5"]


async def test_apply_ssl_proxying_preserves_startup_baseline():
    # config.yaml / CLI entries present at startup must survive UI saves.
    addon = Mitmboard()
    with taddons.context(addon) as tctx:
        tctx.options.update(ignore_hosts=["(?i)^apple\\.com:443$"])
        addon.apply_ssl_proxying({"enabled": True, "exclude": ["*.example.com"]})
        assert list(tctx.options.ignore_hosts) == [
            "(?i)^apple\\.com:443$", r"^.*\.example\.com(:\d+)?$",
        ]


async def test_apply_ssl_proxying_disabled_passes_everything():
    # Charles semantics: Enable SSL Proxying off -> nothing is intercepted.
    # The exclude list collapses to a single wildcard.
    addon = Mitmboard()
    with taddons.context(addon) as tctx:
        addon.apply_ssl_proxying({"enabled": False, "exclude": ["*.example.com"]})
        assert list(tctx.options.ignore_hosts) == [r"^.*(:\d+)?$"]


async def test_configure_captures_baseline_and_applies_saved_state():
    addon = Mitmboard()
    saved = {"enabled": True, "exclude": ["*.example.net"]}
    addon.registry.ssl_proxying = lambda: saved
    with taddons.context(addon) as tctx:
        tctx.options.update(ignore_hosts=["^config-yaml-entry:443$"])
        addon.configure({"listen_port"})
        # baseline captured, then saved UI entries merged on top
        assert list(tctx.options.ignore_hosts) == [
            "^config-yaml-entry:443$", r"^.*\.example\.net(:\d+)?$",
        ]
        # Re-running configure (any option change does) must not re-capture:
        # the merged option value must never become the new baseline.
        addon.configure({"listen_port"})
        assert addon.sslproxy.base == ["^config-yaml-entry:443$"]
        assert list(tctx.options.ignore_hosts) == [
            "^config-yaml-entry:443$", r"^.*\.example\.net(:\d+)?$",
        ]


async def test_configure_without_saved_state_leaves_baseline_alone():
    # A config that predates the feature must leave CLI --ignore-hosts
    # values alone: only a saved dialog state is authoritative (ADR-0010).
    addon = Mitmboard()
    addon.registry.ssl_proxying = lambda: None
    with taddons.context(addon) as tctx:
        tctx.options.update(ignore_hosts=["foo"])
        addon.configure({"listen_port"})
        assert list(tctx.options.ignore_hosts) == ["foo"]
        assert addon.sslproxy.base == ["foo"]


async def test_mflow_map_evicts_with_capacity():
    addon = Mitmboard()
    addon.store.capacity = 2
    addon._mflow_cap = 2
    import asyncio
    async def noop(evt): pass
    addon.broadcaster.publish = noop
    from mitmproxy.test import tflow as _t
    with taddons.context(addon):
        ids = []
        for _ in range(3):
            f = _t.tflow(resp=True); f.client_conn.peername = ("1.1.1.1", 1)
            addon.response(f); ids.append(f.id)
        assert len(addon._mflows) == 2
        assert ids[0] not in addon._mflows


async def test_modified_set_discards_evicted_flow_id():
    # `_modified` tracks flow ids edited at a breakpoint; once the underlying
    # mflow is evicted from `_mflows` under capacity, the id must not linger
    # in `_modified` forever.
    addon = Mitmboard()
    addon.store.capacity = 1
    addon._mflow_cap = 1
    async def noop(evt): pass
    addon.broadcaster.publish = noop
    from mitmproxy.test import tflow as _t
    with taddons.context(addon):
        f = _t.tflow(resp=True); f.client_conn.peername = ("1.1.1.1", 1)
        addon.response(f)
        addon._modified.add(f.id)
        g = _t.tflow(resp=True); g.client_conn.peername = ("1.1.1.1", 2)
        addon.response(g)  # evicts f under cap=1
    assert f.id not in addon._mflows
    assert f.id not in addon._modified


async def test_clear_also_clears_modified_set():
    addon = Mitmboard()
    with taddons.context(addon):
        f = tflow.tflow(resp=True); f.client_conn.peername = ("1.1.1.1", 1)
        addon.response(f)
    addon._modified.add(f.id)
    addon.clear()
    assert f.id not in addon._modified
    assert addon.store.list_meta() == []

from mitmproxy.websocket import WebSocketData, WebSocketMessage
from mitmproxy.test import tflow

def _ws_flow():
    f = tflow.tflow(resp=True)
    f.client_conn.peername = ("10.0.0.5", 5000)
    f.websocket = WebSocketData()
    return f

async def test_websocket_lifecycle_events_and_store():
    addon = Mitmboard()
    published = []
    async def fake_publish(evt): published.append(evt)
    addon.broadcaster.publish = fake_publish
    with taddons.context(addon):
        f = _ws_flow()
        addon.websocket_start(f)
        f.websocket.messages.append(WebSocketMessage(1, True, b'{"a":1}', 10.0))   # Opcode.TEXT == 1
        addon.websocket_message(f)
        f.websocket.messages.append(WebSocketMessage(2, False, b"\x00\x01", 10.2))  # BINARY
        addon.websocket_message(f)
        f.websocket.closed_by_client = True; f.websocket.close_code = 1000
        addon.websocket_end(f)
        await addon._flush_for_test()
    types = [e["type"] for e in published]
    assert types.count("ws.message") == 2
    assert types[0] == "flow.update" and published[0]["flow"]["kind"] == "ws" and published[0]["flow"]["ws"]["open"] is True
    assert published[-1]["type"] == "flow.update" and published[-1]["flow"]["ws"]["open"] is False
    assert published[-1]["flow"]["ws"]["messages"] == 2
    msgs, total = addon.wsstore.get(f.id)
    assert total == 2 and msgs[0]["dir"] == "out" and msgs[1]["type"] == "binary"
    assert addon.store.get(f.id).kind == "ws"

async def test_websocket_message_count_updates_are_throttled():
    addon = Mitmboard()
    published = []
    async def fake_publish(evt): published.append(evt)
    addon.broadcaster.publish = fake_publish
    t = [100.0]
    addon._ws_now = lambda: t[0]
    with taddons.context(addon):
        f = _ws_flow(); addon.websocket_start(f)
        for k in range(5):
            f.websocket.messages.append(WebSocketMessage(1, True, b"x", 10.0 + k)); addon.websocket_message(f)
        t[0] += 0.3
        f.websocket.messages.append(WebSocketMessage(1, True, b"x", 11.0)); addon.websocket_message(f)
        await addon._flush_for_test()
    updates = [e for e in published if e["type"] == "flow.update"]
    # start + first message + one after the 250 ms window
    assert len(updates) == 3 and updates[-1]["flow"]["ws"]["messages"] == 6

async def test_open_ws_flow_survives_newer_http_flows_under_cap():
    # An open websocket that keeps receiving frames must not be evicted from
    # _mflows just because it went quiet at the LRU end while newer http
    # flows push it out -- every touch (start/message) should refresh it.
    addon = Mitmboard()
    addon._mflow_cap = 3
    async def fake_publish(evt): pass
    addon.broadcaster.publish = fake_publish
    from mitmproxy.test import tflow as _t
    with taddons.context(addon):
        f = _ws_flow()
        addon.websocket_start(f)
        for k in range(3):
            g = _t.tflow(resp=True); g.client_conn.peername = ("1.1.1.1", k); addon.response(g)
            f.websocket.messages.append(WebSocketMessage(1, True, b"x", float(k)))
            addon.websocket_message(f)
        await addon._flush_for_test()
    assert f.id in addon._mflows
    msgs, total = addon.wsstore.get(f.id)
    assert total == 3 and len(msgs) == 3

async def test_ws_frames_evicted_with_flow():
    addon = Mitmboard()
    addon._mflow_cap = 1
    async def fake_publish(evt): pass
    addon.broadcaster.publish = fake_publish
    with taddons.context(addon):
        f = _ws_flow(); addon.websocket_start(f)
        f.websocket.messages.append(WebSocketMessage(1, True, b"x", 1.0)); addon.websocket_message(f)
        g = tflow.tflow(resp=True); g.client_conn.peername = ("10.0.0.6", 1); addon.response(g)
        await addon._flush_for_test()
    assert addon.wsstore.get(f.id) == ([], 0)

class _WS:
    async def send_json(self, d): pass

async def test_request_breakpoint_pauses_and_resume_applies_edits(tmp_path, monkeypatch):
    addon = Mitmboard()
    published = []
    async def fake_publish(evt): published.append(evt)
    addon.broadcaster.publish = fake_publish
    await addon.broadcaster.register(_WS())
    monkeypatch.setattr(addon.registry, "breakpoints", lambda: {"enabled": True, "rules": [{"id": "r", "host": "address", "phase": "request"}]})
    with taddons.context(addon):
        f = tflow.tflow(); f.client_conn.peername = ("10.0.0.5", 5000)
        addon.request(f)
        await addon._flush_for_test()
        assert f.intercepted and addon.store.get(f.id).state == "paused_request"
        assert [e["type"] for e in published][-2:] == ["flow.update", "breakpoint.paused"] or published[-1]["type"] == "breakpoint.paused"
        out = addon.resume_paused(f.id, {"headers": [["x-edited", "1"]], "body": "hello"})
        await addon._flush_for_test()
    assert out["modified"] is True and not f.intercepted
    assert f.request.headers["x-edited"] == "1" and f.request.content == b"hello"
    assert addon.store.get(f.id).modified is True and addon.store.get(f.id).state == "pending"
    assert published[-1]["type"] == "breakpoint.resumed"

async def test_no_pause_without_ui_clients(monkeypatch):
    addon = Mitmboard()
    async def fake_publish(evt): pass
    addon.broadcaster.publish = fake_publish
    monkeypatch.setattr(addon.registry, "breakpoints", lambda: {"enabled": True, "rules": [{"id": "r"}]})
    with taddons.context(addon):
        f = tflow.tflow(); f.client_conn.peername = ("10.0.0.5", 5000)
        addon.request(f)
    assert not f.intercepted

async def test_response_breakpoint_edit_status_and_drop(monkeypatch):
    addon = Mitmboard()
    published = []
    async def fake_publish(evt): published.append(evt)
    addon.broadcaster.publish = fake_publish
    await addon.broadcaster.register(_WS())
    monkeypatch.setattr(addon.registry, "breakpoints", lambda: {"enabled": True, "rules": [{"id": "r", "phase": "response"}]})
    with taddons.context(addon):
        f = tflow.tflow(resp=True); f.client_conn.peername = ("10.0.0.5", 5000)
        addon.response(f)
        assert f.intercepted and addon.store.get(f.id).state == "paused_response"
        out = addon.resume_paused(f.id, {"status": 503, "reason": "Nope", "body": "down"})
        await addon._flush_for_test()
    assert f.response.status_code == 503 and f.response.content == b"down" and out["modified"]
    assert addon.store.get(f.id).state == "complete" and addon.store.get(f.id).response.status == 503
    with taddons.context(addon):
        g = tflow.tflow(resp=True); g.client_conn.peername = ("10.0.0.5", 5000)
        addon.response(g)
        dropped = addon.drop_paused(g.id)
        await addon._flush_for_test()
    assert dropped is not None and published[-1]["type"] == "breakpoint.dropped"

async def test_sweep_publishes_timeout(monkeypatch):
    addon = Mitmboard()
    published = []
    async def fake_publish(evt): published.append(evt)
    addon.broadcaster.publish = fake_publish
    await addon.broadcaster.register(_WS())
    monkeypatch.setattr(addon.registry, "breakpoints", lambda: {"enabled": True, "rules": [{"id": "r"}]})
    with taddons.context(addon):
        f = tflow.tflow(); f.client_conn.peername = ("10.0.0.5", 5000)
        addon.request(f)
        addon.breakpoints.timeout_s = 0.0
        addon._sweep_once()
        await addon._flush_for_test()
    assert not f.intercepted and published[-1]["type"] == "breakpoint.timeout"
    assert addon.store.get(f.id).state == "pending"

async def test_clear_resumes_paused_flows(monkeypatch):
    # clear() must not orphan a currently-paused flow: it should resume it
    # (so it's no longer intercepted at mitmproxy's level) and tell any
    # connected UI via breakpoint.resumed, since the flow's /api/paused
    # entry is about to vanish along with the cleared store.
    addon = Mitmboard()
    published = []
    async def fake_publish(evt): published.append(evt)
    addon.broadcaster.publish = fake_publish
    await addon.broadcaster.register(_WS())
    monkeypatch.setattr(addon.registry, "breakpoints", lambda: {"enabled": True, "rules": [{"id": "r"}]})
    with taddons.context(addon):
        f = tflow.tflow(); f.client_conn.peername = ("10.0.0.5", 5000)
        addon.request(f)
        await addon._flush_for_test()
        assert f.intercepted and addon.breakpoints.get(f.id) is not None
        addon.clear()
        await addon._flush_for_test()
    assert f.intercepted is False
    assert addon.breakpoints.paused() == []
    resumed = [e for e in published if e["type"] == "breakpoint.resumed" and e.get("flow_id") == f.id]
    assert len(resumed) == 1 and resumed[0]["modified"] is False


async def test_map_local_hit_marks_the_flow(tmp_path):
    addon = Mitmboard()
    async def noop(evt): pass
    addon.broadcaster.publish = noop
    mock = tmp_path / "mock.json"
    mock.write_text('{"ok":true}', encoding="utf-8")
    addon.registry.map_local = lambda: {"enabled": True, "rules": [
        {"id": "r1", "host": "api.example.com", "path": "/v1/*", "file": str(mock)}]}
    with taddons.context(addon):
        f = tflow.tflow(resp=False)
        f.request.host = "api.example.com"
        f.request.path = "/v1/user"
        addon.request(f)
        await addon._flush_for_test()
    rec = addon.store.get(f.id)
    assert f.response.status_code == 200
    assert rec.maplocal_rule_id == "r1"
    assert rec.maplocal_file == str(mock)


async def test_missing_mock_file_is_a_visible_500_and_still_marked(tmp_path):
    addon = Mitmboard()
    async def noop(evt): pass
    addon.broadcaster.publish = noop
    missing = str(tmp_path / "gone.json")
    addon.registry.map_local = lambda: {"enabled": True, "rules": [
        {"id": "r7", "host": "api.example.com", "path": "/v1/*", "file": missing}]}
    with taddons.context(addon):
        f = tflow.tflow(resp=False)
        f.request.host = "api.example.com"
        f.request.path = "/v1/user"
        addon.request(f)
        await addon._flush_for_test()
    rec = addon.store.get(f.id)
    assert f.response.status_code == 500
    assert rec.maplocal_rule_id == "r7"
    assert rec.maplocal_file == missing


async def test_hit_marker_survives_the_completion_record(tmp_path):
    # The record is rebuilt from the flow on every event; a marker that lived
    # only on the first Flow instance would vanish when the response lands.
    addon = Mitmboard()
    async def noop(evt): pass
    addon.broadcaster.publish = noop
    mock = tmp_path / "mock.json"
    mock.write_text('{"ok":true}', encoding="utf-8")
    addon.registry.map_local = lambda: {"enabled": True, "rules": [
        {"id": "r1", "host": "api.example.com", "path": "/v1/*", "file": str(mock)}]}
    with taddons.context(addon):
        f = tflow.tflow(resp=False)
        f.request.host = "api.example.com"
        f.request.path = "/v1/user"
        addon.request(f)
        addon.response(f)
        await addon._flush_for_test()
    rec = addon.store.get(f.id)
    assert rec.state == "complete"
    assert rec.maplocal_rule_id == "r1"


async def test_save_response_file_derives_the_extension_from_content_type(tmp_path):
    addon = Mitmboard()
    with taddons.context(addon):
        f = tflow.tflow(resp=True)
        f.response.headers["content-type"] = "application/json; charset=utf-8"
        f.response.content = b'{"ok":true}'
        addon._mflows[f.id] = f
        saved = addon.save_response_file(f.id, root=tmp_path)
    assert saved is not None
    assert saved["path"].endswith(".json")
    assert saved["size"] == 11
    assert tmp_path.joinpath(saved["path"].rsplit("/", 1)[-1]).read_bytes() == b'{"ok":true}'


async def test_save_response_file_supports_binary_bodies(tmp_path):
    addon = Mitmboard()
    with taddons.context(addon):
        f = tflow.tflow(resp=True)
        f.response.headers["content-type"] = "image/png"
        f.response.content = b"\x89PNG\r\n\x1a\n"
        addon._mflows[f.id] = f
        saved = addon.save_response_file(f.id, root=tmp_path)
    assert saved is not None and saved["path"].endswith(".png")


async def test_save_response_file_returns_none_for_unknown_flow():
    addon = Mitmboard()
    assert addon.save_response_file("nope") is None
