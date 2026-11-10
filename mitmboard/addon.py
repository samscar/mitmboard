from __future__ import annotations
import asyncio
import logging
import time
from collections import OrderedDict
from pathlib import Path
from mitmboard.paths import config_path, managed_dir
from mitmboard import ignorehosts
from mitmboard.managed import extension_for_content_type, store_bytes
from mitmproxy import ctx, http
from mitmproxy.addonmanager import Loader
from mitmproxy.http import HTTPFlow, Headers
from mitmboard.store import FlowStore
from mitmboard.clients import ClientRegistry
from mitmboard.broadcaster import Broadcaster
from mitmboard.transform import flow_to_record
from mitmboard.sslproxy import SSLProxy
from mitmboard.wsstore import WsStore
from mitmboard.breakpoints import BreakpointEngine
from mitmboard.maplocal import MapLocalEngine, MapLocalFileError

_log = logging.getLogger("mitmboard")


def apply_request_edits(mflow, edits: dict) -> bool:
    """Apply method/url/headers/body edits to mflow.request. Returns True if anything changed."""
    req = mflow.request
    changed = False
    if edits.get("method"):
        req.method = edits["method"]; changed = True
    if edits.get("url"):
        req.url = edits["url"]; changed = True
    if edits.get("headers") is not None:
        req.headers = Headers([(k.encode("utf-8"), v.encode("utf-8")) for k, v in edits["headers"]])
        changed = True
    if "body" in edits and edits["body"] is not None:
        req.content = edits["body"].encode("utf-8"); changed = True
    return changed


def apply_response_edits(mflow, edits: dict) -> bool:
    """Apply status/reason/headers/body edits to mflow.response. Returns True if anything changed."""
    resp = mflow.response
    changed = False
    if resp is None:
        return False
    if edits.get("status"):
        resp.status_code = int(edits["status"]); changed = True
    if edits.get("reason") is not None:
        resp.reason = edits["reason"]; changed = True
    if edits.get("headers") is not None:
        resp.headers = Headers([(k.encode("utf-8"), v.encode("utf-8")) for k, v in edits["headers"]])
        changed = True
    if "body" in edits and edits["body"] is not None:
        resp.content = edits["body"].encode("utf-8"); changed = True
    return changed

class Mitmboard:
    def __init__(self) -> None:
        self.store = FlowStore()
        self.registry = ClientRegistry(config_path())
        self.broadcaster = Broadcaster()
        self.sslproxy = SSLProxy()
        self._mflows: OrderedDict[str, HTTPFlow] = OrderedDict()
        self._mflow_cap = 5000
        self.wsstore = WsStore()
        self._ws_throttle: dict[str, float] = {}
        self._ws_now = time.monotonic
        # Wrapped in a lambda (not passed as `self.registry.breakpoints`
        # directly) so that re-pointing `self.registry` or monkeypatching
        # `registry.breakpoints` on an existing instance -- as the tests do
        # -- is honored; a captured bound method would freeze to whatever
        # `breakpoints` resolved to at this line and ignore later rebinding.
        self.breakpoints = BreakpointEngine(lambda: self.registry.breakpoints())
        self.maplocal = MapLocalEngine(lambda: self.registry.map_local())
        self._modified: set[str] = set()
        # The web server is started in `running()` on mitmproxy's own event
        # loop. asyncio keeps only weak references to tasks, so hold strong
        # references here: `done()` needs both the Server handle (to request
        # a graceful shutdown) and the tasks (to await them).
        self._server = None
        self._serve_task = None
        self._sweep_task = None

    def load(self, loader: Loader) -> None:
        # Same names and defaults as mitmweb: `--set web_port=9091` therefore
        # works here too, and the CLI can hand its flags over as plain --set
        # values instead of inventing a second spelling.
        loader.add_option("web_port", int, 8081, "Mitmboard web UI port")
        loader.add_option("web_host", str, "127.0.0.1", "Mitmboard web UI host")
        loader.add_option("web_open_browser", bool, True, "Open the web UI in a browser on startup")

    def sync_from_config_yaml(self, options=None) -> list[str]:
        """Make config.yaml win over CLI --ignore-hosts / --set (ADR 0014).

        Called once from running(). We deliberately do NOT do this from a
        `configure()` hook: our own options.update() triggers configure(),
        which would immediately replay the file over the value the UI just
        wrote. Later external edits are replayed by GET /api/ssl-proxying.
        """
        patterns, _ = ignorehosts.read_patterns(ignorehosts.mitmproxy_config_path())
        self.sslproxy.apply(
            {"enabled": self.registry.ssl_proxying()["enabled"],
             "exclude": patterns}, options if options is not None else ctx.options)
        return patterns

    async def running(self) -> None:
        import uvicorn, webbrowser
        from mitmboard.server import make_app
        try:
            self.sync_from_config_yaml()
        except Exception:
            _log.exception("mitmboard: applying ignore_hosts from config.yaml failed")
        port = ctx.options.web_port
        host = ctx.options.web_host
        proxy_port = ctx.options.listen_port or 8080
        app = make_app(self.store, self.registry, self.broadcaster,
                       replayer=self.replay, edited_replayer=self.replay_edited,
                       ssl_proxying_apply=self.apply_ssl_proxying,
                       ssl_proxying_state=self.sslproxy.state,
                       wsstore=self.wsstore,
                       on_clear=self.clear,
                       breakpoints=self.breakpoints,
                       resume_paused=self.resume_paused,
                       drop_paused=self.drop_paused,
                       maplocal_dir=managed_dir(),
                       save_response_file=self.save_response_file,
                       ignorehosts_path=ignorehosts.mitmproxy_config_path(),
                       web_port=port, proxy_port=proxy_port)
        # A bounded graceful shutdown keeps a stuck connection from hanging
        # `done()` forever; the hook itself also has a 2 s outer budget.
        config = uvicorn.Config(app, host=host, port=port, log_level="warning",
                                timeout_graceful_shutdown=1.0)
        server = uvicorn.Server(config)
        self._server = server
        self._serve_task = asyncio.ensure_future(server.serve())
        self._sweep_task = asyncio.ensure_future(self._sweep_loop())
        # The UI has no authentication. Say so out loud when it is reachable
        # from the network instead of assuming the user meant it.
        if host not in ("127.0.0.1", "localhost", "::1"):
            _log.warning(
                "Mitmboard web UI is bound to %s without authentication; "
                "anyone who can reach it can change Map Local rules and breakpoints.", host
            )
        if ctx.options.web_open_browser:
            shown = "127.0.0.1" if host in ("0.0.0.0", "::", "") else host
            webbrowser.open(f"http://{shown}:{port}")

    def _publish(self, evt: dict) -> None:
        fut = asyncio.ensure_future(self.broadcaster.publish(evt))

        def _on_done(f: asyncio.Future) -> None:
            # `.exception()` raises CancelledError on a cancelled future. That
            # is the normal fate of in-flight publishes during shutdown, so
            # guard it rather than logging a bogus error from the callback.
            if f.cancelled():
                return
            err = f.exception()
            if err is not None:
                _log.error("mitmboard publish failed: %r", err)

        fut.add_done_callback(_on_done)

    async def done(self) -> None:
        """Stop the web server before mitmproxy tears the event loop down.

        `mitmdump` runs everything under `asyncio.run()`. Without this hook,
        `master.run()` returns and `asyncio.Runner.close()` immediately cancels
        every task uvicorn left behind; wsproto logs each cancelled /ws task as
        "Exception in ASGI application" and the lifespan task as a
        CancelledError traceback. Letting `serve()` complete its own shutdown
        injects websocket.disconnect(1012) into every /ws connection, closes
        the lifespan cleanly, and leaves nothing for the runner to cancel.
        """
        if self._server is not None:
            # handle_exit already sets this on SIGINT/SIGTERM; doing it here
            # also covers a programmatic master.shutdown() with no signal.
            self._server.should_exit = True
        if self._sweep_task is not None:
            self._sweep_task.cancel()
        try:
            if self._serve_task is not None:
                try:
                    # shield so a timeout does not cancel the task behind our
                    # back; we cancel and await it explicitly below.
                    await asyncio.wait_for(asyncio.shield(self._serve_task), timeout=2.0)
                except asyncio.TimeoutError:
                    self._serve_task.cancel()
                except Exception:
                    # uvicorn reports its own failures. A shutdown must not
                    # turn into a traceback on the user's terminal.
                    pass
        finally:
            # Drain both tasks; `asyncio.run()` must find nothing to cancel.
            for task in (self._serve_task, self._sweep_task):
                if task is None:
                    continue
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass

    def _record(self, flow, state: str | None = None):
        rec = flow_to_record(flow, self.registry)
        if state:
            rec.state = state
        if flow.id in self._modified:
            rec.modified = True
        self.store.add(rec)
        return rec

    def _retain(self, flow: HTTPFlow) -> None:
        self._mflows[flow.id] = flow
        self._mflows.move_to_end(flow.id)
        while len(self._mflows) > self._mflow_cap:
            old_id, _ = self._mflows.popitem(last=False)
            self.wsstore.evict(old_id)
            self._ws_throttle.pop(old_id, None)
            self._modified.discard(old_id)

    def clear(self) -> None:
        # Resume anything currently intercepted at a breakpoint *before*
        # wiping the store -- otherwise the paused flow's /api/paused entry
        # (which joins against the store) vanishes while mitmproxy keeps
        # holding it open, and the UI loses any way to Continue/Drop it
        # until the 60s sweep eventually resumes it.
        for entry in self.breakpoints.resume_all():
            self._publish({"type": "breakpoint.resumed", "flow_id": entry["flow_id"], "modified": False})
        self.store.clear()
        self._modified.clear()

    def _emit(self, evt_type: str, flow: HTTPFlow) -> None:
        rec = self._record(flow)
        self._retain(flow)
        self._publish({"type": evt_type, "flow": rec.meta()})

    def _apply_map_local(self, flow: HTTPFlow) -> bool:
        """Replace the response from a local file. Returns True if it fired.

        A missing or unreadable file becomes a visible 500 rather than a silent
        pass-through: the whole point of a Map Local rule is that the request
        must NOT reach the server, so letting it through would quietly test
        against production data instead of the mock.
        """
        if getattr(flow, "response", None) is not None:
            return False
        try:
            hit = self.maplocal.hit_for(flow)
        except MapLocalFileError as e:
            _log.error("mitmboard map local: %s", e)
            self._mark_hit(flow, e.rule_id, e.path)
            flow.response = http.Response.make(
                500,
                f"Mitmboard Map Local: {e}\n".encode(),
                {"Content-Type": "text/plain; charset=utf-8"},
            )
            return True
        if hit is None:
            return False
        self._mark_hit(flow, hit.rule_id, hit.file)
        flow.response = http.Response.make(hit.status, hit.body, {"Content-Type": hit.content_type})
        return True

    @staticmethod
    def _mark_hit(flow: HTTPFlow, rule_id: str | None, file: str | None) -> None:
        """Record the hit on the flow itself, so later records keep it.

        The record is rebuilt from the mitmproxy flow on every event, so the
        marker has to survive there rather than on our Flow copy.
        """
        if rule_id:
            flow.metadata["mitmboard.maplocal.rule_id"] = rule_id
        if file:
            flow.metadata["mitmboard.maplocal.file"] = file

    def save_response_file(self, flow_id: str, root: Path | None = None) -> dict | None:
        """Write a captured response into the managed directory.

        The extension is derived from the response Content-Type, so the mock is
        later served back as application/json rather than octet-stream.
        """
        mflow = self._mflows.get(flow_id)
        if mflow is None or getattr(mflow, "response", None) is None:
            return None
        content = mflow.response.get_content(strict=False) or b""
        content_type = mflow.response.headers.get("content-type", "")
        path = store_bytes(root or managed_dir(), content,
                           extension_for_content_type(content_type))
        return {"path": str(path), "size": len(content)}

    def apply_ssl_proxying(self, data: dict) -> dict:
        """Push the freshly written config.yaml list onto the live proxy.

        mitmproxy's NextLayer recompiles its ignore_hosts matchers when the
        option changes, so new connections honor the list immediately.
        Returns the full live state for the API."""
        return self.sslproxy.apply(data, ctx.options)

    def request(self, flow: HTTPFlow) -> None:
        self._apply_map_local(flow)
        # Stream a pending row the moment a request starts, so in-flight and
        # failed requests appear immediately (not only on response).
        self._emit("flow.new", flow)
        rule = self.breakpoints.should_pause(flow, "request", self.broadcaster.client_count() > 0)
        if rule is not None:
            self._pause(flow, "request", rule)

    def response(self, flow: HTTPFlow) -> None:
        rule = self.breakpoints.should_pause(flow, "response", self.broadcaster.client_count() > 0)
        if rule is not None:
            # flow.intercept() (inside _pause) holds the response back from the
            # client until resume_paused() runs. Do NOT emit flow.complete here
            # -- that would record the flow as done while it's still paused.
            # resume_paused() (or the timeout sweep) records the eventual
            # "complete" state once delivery actually proceeds.
            self._pause(flow, "response", rule)
            return
        self._emit("flow.complete", flow)

    def error(self, flow: HTTPFlow) -> None:
        self._emit("flow.error", flow)

    def _pause(self, flow: HTTPFlow, phase: str, rule) -> None:
        self._retain(flow)
        entry = self.breakpoints.pause(flow, phase, rule)
        rec = self._record(flow, state=f"paused_{phase}")
        self._publish({"type": "flow.update", "flow": rec.meta()})
        self._publish({"type": "breakpoint.paused", "entry": entry, "flow": rec.model_dump()})

    def resume_paused(self, flow_id: str, edits: dict | None) -> dict | None:
        flow = self.breakpoints.flow(flow_id)
        if flow is None:
            return None
        phase = self.breakpoints.get(flow_id)["phase"]
        modified = False
        if edits:
            modified = apply_request_edits(flow, edits) if phase == "request" else apply_response_edits(flow, edits)
        if modified:
            self._modified.add(flow_id)
        entry = self.breakpoints.resume(flow_id)
        rec = self._record(flow, state="pending" if phase == "request" else "complete")
        self._publish({"type": "flow.update", "flow": rec.meta()})
        self._publish({"type": "breakpoint.resumed", "flow_id": flow_id, "modified": modified})
        entry["modified"] = modified
        return entry

    def drop_paused(self, flow_id: str) -> dict | None:
        flow = self.breakpoints.flow(flow_id)
        if flow is None:
            return None
        entry = self.breakpoints.drop(flow_id)
        rec = self._record(flow, state="error")
        rec.error = "dropped at breakpoint"
        self.store.add(rec)
        self._publish({"type": "flow.update", "flow": rec.meta()})
        self._publish({"type": "breakpoint.dropped", "flow_id": flow_id})
        return entry

    def _sweep_once(self) -> None:
        for entry in self.breakpoints.sweep():
            flow = self._mflows.get(entry["flow_id"])
            if flow is not None:
                rec = self._record(flow, state="pending" if entry["phase"] == "request" else "complete")
                self._publish({"type": "flow.update", "flow": rec.meta()})
            self._publish({"type": "breakpoint.timeout", "flow_id": entry["flow_id"]})

    async def _sweep_loop(self) -> None:
        while True:
            await asyncio.sleep(1.0)
            try:
                self._sweep_once()
            except Exception:
                _log.exception("mitmboard breakpoint sweep failed")

    def _emit_ws_update(self, flow: HTTPFlow) -> None:
        rec = flow_to_record(flow, self.registry)
        if rec.ws is not None:
            rec.ws.messages = self.wsstore.count(flow.id)   # authoritative count survives the deque cap
        self.store.add(rec)
        self._publish({"type": "flow.update", "flow": rec.meta()})

    def websocket_start(self, flow: HTTPFlow) -> None:
        already_tracked = flow.id in self._mflows
        self._mflows[flow.id] = flow
        if already_tracked:
            self._mflows.move_to_end(flow.id)
        self._emit_ws_update(flow)

    def websocket_message(self, flow: HTTPFlow) -> None:
        if flow.id in self._mflows:
            self._mflows.move_to_end(flow.id)
        if not flow.websocket or not flow.websocket.messages:
            return
        m = flow.websocket.messages[-1]
        msg = self.wsstore.append(flow.id, m.from_client, m.is_text, m.content, m.timestamp)
        self._publish({"type": "ws.message", "flow_id": flow.id, "message": msg})
        now = self._ws_now()
        if now - self._ws_throttle.get(flow.id, -1.0) >= 0.25:
            self._ws_throttle[flow.id] = now
            self._emit_ws_update(flow)

    def websocket_end(self, flow: HTTPFlow) -> None:
        self._ws_throttle.pop(flow.id, None)
        self._emit_ws_update(flow)

    async def _flush_for_test(self) -> None:
        await asyncio.sleep(0)

    def replay(self, flow_id: str) -> bool:
        mflow = self._mflows.get(flow_id)
        if mflow is None:
            return False
        ctx.master.commands.call("replay.client", [mflow])
        return True

    def replay_edited(self, flow_id: str, edits: dict) -> bool:
        """Replay a retained flow with an edited request (edit & resend).

        `edits` may carry any of: method (str), url (str), headers
        (list of [name, value]), body (str). Missing keys leave the
        original request untouched. The clone gets a fresh id so it
        surfaces as a brand-new flow.
        """
        mflow = self._mflows.get(flow_id)
        if mflow is None:
            return False
        clone = mflow.copy()
        apply_request_edits(clone, edits)
        clone.response = None
        clone.error = None
        ctx.master.commands.call("replay.client", [clone])
        return True

addons = [Mitmboard()]
