from __future__ import annotations
from pathlib import Path
from typing import Any, Callable, TYPE_CHECKING
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from .netinfo import lan_ips
from .managed import ManagedFileTooLarge, extension_for, store_bytes, sweep
from .sessions import dump_session, load_session
from .har import flows_to_har
from .cainfo import ca_info
from mitmboard.paths import web_dist

if TYPE_CHECKING:
    from .wsstore import WsStore
    from .breakpoints import BreakpointEngine

class LabelBody(BaseModel):
    label: str

class ReplayEdit(BaseModel):
    method: str | None = None
    url: str | None = None
    headers: list[tuple[str, str]] | None = None
    body: str | None = None

class BreakpointsBody(BaseModel):
    enabled: bool = True
    rules: list[dict] = []

class MapLocalBody(BaseModel):
    enabled: bool = True
    rules: list[dict] = []

class SSLProxyingBody(BaseModel):
    enabled: bool = True
    exclude: list[str] = []

class ResumeBody(BaseModel):
    method: str | None = None
    url: str | None = None
    headers: list[list[str]] | None = None
    body: str | None = None
    status: int | None = None
    reason: str | None = None

async def _run_ws_loop(sock: WebSocket, broadcaster: Any) -> None:
    """Drive a registered /ws socket's receive loop, always unregistering it
    from the broadcaster on the way out -- not just on a clean
    WebSocketDisconnect. A socket that dies some other way (e.g. a protocol
    error) must not linger in the broadcaster set: that would keep
    client_count() > 0 with no live UI, which can make a breakpoint rule
    pause a request nobody will ever see."""
    try:
        while True:
            await sock.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        broadcaster.unregister(sock)


def make_app(store, registry, broadcaster, replayer: Callable[[str], bool] | None = None,
             edited_replayer: Callable[[str, dict], bool] | None = None,
             ssl_proxying_apply: Callable[[dict], dict] | None = None,
             ssl_proxying_state: Callable[[], dict] | None = None,
             wsstore: "WsStore | None" = None,
             on_clear: Callable[[], None] | None = None,
             breakpoints: "BreakpointEngine | None" = None,
             resume_paused: Callable[[str, dict], dict | None] | None = None,
             drop_paused: Callable[[str], dict | None] | None = None,
             maplocal_dir: Path | None = None,
             save_response_file: Callable[[str], dict | None] | None = None,
             web_port: int = 8081, proxy_port: int = 8080) -> FastAPI:
    app = FastAPI(title="Mitmboard")

    @app.get("/api/flows")
    def list_flows() -> list[dict]:
        return store.list_meta()

    @app.get("/api/flows/{flow_id}")
    def get_flow(flow_id: str) -> dict:
        flow = store.get(flow_id)
        if flow is None:
            raise HTTPException(status_code=404, detail="not found")
        d = flow.model_dump()
        d["duration_ms"] = flow.timing.duration_ms
        return d

    @app.delete("/api/flows")
    async def clear() -> dict:
        (on_clear or store.clear)()
        return {"ok": True}

    @app.get("/api/clients")
    def clients() -> list[dict]:
        counts = store.client_counts()
        return [{"ip": ip, "label": registry.label_for(ip), "count": n,
                 "kind": registry.kind_for(ip)}
                for ip, n in counts.items()]

    @app.put("/api/clients/{ip}")
    def set_label(ip: str, body: LabelBody) -> dict:
        registry.set_label(ip, body.label)
        return {"ip": ip, "label": body.label}

    @app.get("/api/connect-info")
    def connect_info() -> dict:
        ips = lan_ips()
        primary = ips[0] if ips else "127.0.0.1"
        return {"lan_ips": ips, "proxy_port": proxy_port,
                "cert_url": "http://mitm.it",
                "proxy_hint": f"{primary}:{proxy_port}"}

    @app.get("/api/ca-info")
    def ca_info_endpoint() -> dict:
        return ca_info()

    @app.get("/api/session")
    def download_session() -> JSONResponse:
        return JSONResponse(
            dump_session(store),
            headers={"Content-Disposition": "attachment; filename=mitmboard-session.json"},
        )

    @app.post("/api/session")
    def upload_session(flows: list[dict]) -> dict:
        return {"loaded": load_session(store, flows)}

    @app.get("/api/export/har")
    def export_har() -> JSONResponse:
        flows = [store.get(m["id"]) for m in store.list_meta()]
        return JSONResponse(
            flows_to_har(flows),
            headers={"Content-Disposition": "attachment; filename=mitmboard.har"},
        )

    @app.get("/api/flows/{flow_id}/ws")
    def ws_messages(flow_id: str, after: int = -1) -> dict:
        if store.get(flow_id) is None:
            raise HTTPException(status_code=404, detail="not found")
        if wsstore is None:
            return {"messages": [], "total": 0}
        msgs, total = wsstore.get(flow_id, after=after)
        return {"messages": msgs, "total": total}

    @app.post("/api/flows/{flow_id}/replay")
    async def replay(flow_id: str) -> dict:
        if replayer is None:
            raise HTTPException(status_code=503, detail="replay unavailable")
        if not replayer(flow_id):
            raise HTTPException(status_code=404, detail="not found")
        return {"ok": True}

    @app.post("/api/flows/{flow_id}/replay-edited")
    async def replay_edited(flow_id: str, edit: ReplayEdit) -> dict:
        if edited_replayer is None:
            raise HTTPException(status_code=503, detail="replay unavailable")
        edits = {k: v for k, v in edit.model_dump().items() if v is not None}
        if not edited_replayer(flow_id, edits):
            raise HTTPException(status_code=404, detail="not found")
        return {"ok": True}

    @app.get("/api/ssl-proxying")
    def get_ssl_proxying() -> dict:
        # No saved state yet -> the feature's neutral default: enabled with
        # an empty list, which intercepts everything (no exclusions). The
        # baseline (config.yaml / --ignore-hosts patterns captured at
        # startup) comes from the addon when it is running; the UI renders
        # it read-only.
        data = registry.ssl_proxying() or {"enabled": True, "exclude": []}
        base = []
        if ssl_proxying_state is not None:
            try:
                base = ssl_proxying_state().get("base", [])
            except Exception:
                base = []
        return {**data, "base": base}

    @app.put("/api/ssl-proxying")
    async def put_ssl_proxying(body: SSLProxyingBody) -> dict:
        try:
            registry.set_ssl_proxying(body.model_dump())
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        # The addon merges the saved UI list with the captured baseline and
        # pushes it onto mitmproxy's ignore_hosts option; NextLayer
        # recompiles, so new connections honor it immediately.
        if ssl_proxying_apply is not None:
            try:
                data = ssl_proxying_apply(registry.ssl_proxying())
            except Exception as e:
                raise HTTPException(status_code=503, detail=f"proxy unavailable: {e}")
        else:
            data = {**registry.ssl_proxying(), "base": []}
        await broadcaster.publish({"type": "sslproxying.update", **data})
        return data

    @app.get("/api/breakpoints")
    def get_breakpoints() -> dict:
        return registry.breakpoints()

    @app.put("/api/breakpoints")
    async def put_breakpoints(body: BreakpointsBody) -> dict:
        try:
            registry.set_breakpoints(body.model_dump())
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        data = registry.breakpoints()
        await broadcaster.publish({"type": "breakpoints.update", **data})
        return data

    @app.get("/api/maplocal")
    def get_maplocal() -> dict:
        return registry.map_local()

    @app.put("/api/maplocal")
    async def put_maplocal(body: MapLocalBody) -> dict:
        try:
            registry.set_map_local(body.model_dump())
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        data = registry.map_local()
        # Best-effort cleanup: files Mitmboard created that no rule references
        # any more. Fresh uploads are protected by the TTL inside sweep().
        if maplocal_dir is not None:
            try:
                sweep(maplocal_dir, {str(r.get("file", "")) for r in data.get("rules", [])})
            except OSError:
                pass
        await broadcaster.publish({"type": "maplocal.update", **data})
        return data

    @app.post("/api/maplocal/files")
    async def upload_maplocal_file(request: Request, filename: str = "") -> dict:
        """Accept a browser upload as a raw body and store it in the managed dir.

        The filename arrives as a query parameter rather than a multipart part
        so the endpoint needs no multipart parser: only the extension matters,
        and the stored name is the content hash.
        """
        if maplocal_dir is None:
            raise HTTPException(status_code=503, detail="managed files unavailable")
        data = await request.body()
        try:
            path = store_bytes(maplocal_dir, data, extension_for(filename))
        except ManagedFileTooLarge as e:
            raise HTTPException(status_code=422, detail=str(e))
        return {"path": str(path), "size": len(data)}

    @app.post("/api/flows/{flow_id}/maplocal-file")
    async def save_captured_response(flow_id: str) -> dict:
        """Write a captured response body into the managed dir and return its path."""
        if save_response_file is None:
            raise HTTPException(status_code=503, detail="save as file unavailable")
        try:
            saved = save_response_file(flow_id)
        except ManagedFileTooLarge as e:
            raise HTTPException(status_code=422, detail=str(e))
        if saved is None:
            raise HTTPException(status_code=404, detail="not found")
        return saved

    @app.get("/api/paused")
    def list_paused() -> list[dict]:
        if breakpoints is None:
            return []
        out = []
        for entry in breakpoints.paused():
            flow = store.get(entry["flow_id"])
            if flow is None:
                continue
            out.append({**entry, "flow": flow.model_dump()})
        return out

    @app.post("/api/paused/{flow_id}/resume")
    async def resume(flow_id: str, body: ResumeBody | None = None) -> dict:
        if resume_paused is None:
            raise HTTPException(status_code=503, detail="breakpoints unavailable")
        edits: dict[str, Any] = {}
        if body is not None:
            edits = {k: v for k, v in body.model_dump().items() if v is not None}
        result = resume_paused(flow_id, edits)
        if result is None:
            raise HTTPException(status_code=404, detail="not found")
        return {"ok": True, "modified": bool(result.get("modified"))}

    @app.post("/api/paused/{flow_id}/drop")
    async def drop(flow_id: str) -> dict:
        if drop_paused is None:
            raise HTTPException(status_code=503, detail="breakpoints unavailable")
        result = drop_paused(flow_id)
        if result is None:
            raise HTTPException(status_code=404, detail="not found")
        return {"ok": True}

    @app.websocket("/ws")
    async def ws(sock: WebSocket) -> None:
        await sock.accept()
        await broadcaster.register(sock)
        await _run_ws_loop(sock, broadcaster)

    dist = web_dist()
    if dist is not None:
        app.mount("/", StaticFiles(directory=dist, html=True), name="static")
    return app
