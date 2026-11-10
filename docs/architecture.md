# Architecture

Mitmboard has three layers: a **mitmproxy addon** that captures traffic, a **FastAPI backend** that exposes it, and a **React web UI** that renders it. All three run in one process on `127.0.0.1`; a desktop shell (`desktop/`, Tauri) bundles that process as a native app.

<p align="center"><img src="media/architecture.svg" alt="Client → mitmproxy (:8080) → Mitmboard addon → FastAPI (:8081) → React web UI, with the addon reading ~/.mitmboard/config.json." width="820"></p>

> The diagram is editable: open [`architecture.excalidraw`](architecture.excalidraw) in [Excalidraw](https://excalidraw.com) and re‑export `media/architecture.svg`.

## 1. Capture — the mitmproxy addon (`mitmboard/addon.py`)

Mitmboard runs as a standard mitmproxy addon loaded by `mitmdump`. mitmproxy terminates TLS with its own CA and re‑encrypts to the origin, so decrypted flows are available to the addon's hooks.

- On `request` a pending row is streamed (`flow.new`); on `response` / `error` the addon converts the mitmproxy `HTTPFlow` into a plain `Flow` record (`transform.py`) and stores it in an in‑memory ring buffer (`store.py`, capped at 5000, oldest evicted), broadcasting `flow.complete` / `flow.error`.
- Original mitmproxy flow objects are retained (bounded) so **Replay** and **Edit‑and‑Resend** can re‑issue them; the edit logic lives in `apply_request_edits` / `apply_response_edits`.
- When mitmproxy finishes starting (`running` hook), the addon boots the FastAPI app on a uvicorn server bound to `127.0.0.1`, and starts a 1 s breakpoint sweep task. It keeps strong references to the server and both tasks (asyncio only holds weak references).
- On shutdown, the addon's `done` hook — awaited by `master.run()`'s `finally`, before `asyncio.run()` closes the loop — sets `server.should_exit` and awaits the `serve()` task. This lets uvicorn run its own graceful shutdown: it injects `websocket.disconnect` (1012) into every `/ws` connection and closes the lifespan cleanly. Without it, `asyncio.run()` cancels those tasks from outside and uvicorn's wsproto protocol logs a `CancelledError` traceback per connection. `Config(timeout_graceful_shutdown=1.0)` and a 2 s budget in `done()` bound the wait.

`cli.py` translates Mitmboard's mitmweb-compatible web flags (`--web-port`, `--web-host`, `--web-open-browser`) into `mitmdump` argv and always loads the addon. Proxy and traffic flags are mitmproxy's own and pass through untouched. `paths.py` resolves the built UI and the addon across dev, PyPI wheel, and frozen (PyInstaller) layouts.

### 排除（SSL Proxying Settings，`sslproxy.py` + `ignorehosts.py`）

`~/.mitmproxy/config.yaml` 的 `ignore_hosts` 是排除的唯一真相来源（[ADR 0014](adr/0014-ignore-hosts-as-source-of-truth.md)）。`ignorehosts.py` 用 `ruamel.yaml` 的 round-trip 模式读写该块，保留注释、其它键与引号风格，并以 `mkstemp` + `os.replace` 原子替换；首次写入前生成 `.bak`。`SSLProxy.apply()` 把文件里的**原始 regex**直接推到 `ctx.options.ignore_hosts`（`NextLayer` 在 option 变更时重编译，新连接立即生效，已建立的隧道保留旧决定）。

写盘由 UI 的每一次增删改即时触发；`GET /api/ssl-proxying` 每次重读文件，与运行时状态不一致时回放并广播 `sslproxying.update`，因此外部手工编辑在刷新页面后生效、无需重启。响应与广播携带 `ignore_hosts` 块内容的 `revision`，检测到外部改动时返回 409，由界面显式选择「以文件为准重载」或「以我的列表覆盖」，永不静默覆盖。**Enable SSL Proxying** 关闭时运行时置全匹配但**不改文件**；该开关状态存在 `~/.mitmboard/config.json` 的 `ssl_proxying.enabled`。CLI `--ignore-hosts` / `--set` 注入值在启动时由 `running()` 中的 `sync_from_config_yaml()` 覆盖。

### Breakpoints (`breakpoints.py`)

`BreakpointEngine` matches structured rules (host / path / method / phase, fnmatch globs) and pauses matching flows with `flow.intercept()` in the `request` / `response` hooks — but never for replays and never while no UI client is connected (`Broadcaster.client_count() == 0`), so an armed rule can't strand a device. A paused flow's record carries state `paused_request` / `paused_response`; `resume_paused` applies edits and continues, `drop_paused` kills it. A 1 s sweep auto‑continues anything paused longer than 60 s. Rules live under `"breakpoints"` in `~/.mitmboard/config.json`.

### WebSocket frames (`wsstore.py`)

The `websocket_start` / `websocket_message` / `websocket_end` hooks mark the flow `kind: "ws"` and append each frame to a per‑connection capped buffer (`WsStore`, 500 frames) with a lightweight text / JSON / MsgPack / Protobuf preview. Frames stream as `ws.message` events; a throttled `flow.update` keeps the row's frame count fresh.

### Body decoders (`decode.py`)

`decode_body` renders Protobuf, gRPC (schema‑less), MsgPack, multipart, and URL‑encoded bodies via mitmproxy's content views, size‑guarded so a large body never stalls the hot hook path. The result is stored on the record as `body_view` (a short label) and `body_pretty`.

### Device detection (`clients.py`)

`ClientRegistry.device_for(ip, user_agent)` returns a `(label, kind)` pair and remembers the first device *kind* seen per IP, recognising browsers and native app HTTP stacks (`CFNetwork`/`Darwin` → iOS app, `okhttp`/`Dalvik` → Android app). Labels, SSL Proxying settings, and breakpoint rules are persisted atomically to `~/.mitmboard/config.json` with a read‑modify‑write that preserves the other keys.

## 2. API — the FastAPI backend (`mitmboard/server.py`)

`make_app(store, registry, broadcaster, ...)` builds the app. Key endpoints:

| Method | Path                              | Purpose                                     |
|--------|-----------------------------------|---------------------------------------------|
| GET    | `/api/flows`                      | flow list (metadata, no bodies)             |
| GET    | `/api/flows/{id}`                 | full flow detail (headers + bodies)         |
| GET    | `/api/flows/{id}/ws`              | WebSocket frames for a `ws` flow (paged)    |
| DELETE | `/api/flows`                      | clear the store                             |
| GET/PUT | `/api/clients` · `/api/clients/{ip}` | per‑device counts + kind · rename       |
| POST   | `/api/flows/{id}/replay` · `/replay-edited` | replay, or replay with edits       |
| GET/PUT | `/api/ssl-proxying`               | enable flag · raw regex list · block revision |
| GET/PUT | `/api/breakpoints`               | breakpoint rules + enabled toggle           |
| GET    | `/api/paused`                     | currently paused flows (with a snapshot)    |
| POST   | `/api/paused/{id}/resume` · `/drop` | continue (with optional edits) · drop     |
| GET    | `/api/export/har`                 | HAR 1.2 export                              |
| GET/POST | `/api/session`                  | save / load a Mitmboard JSON session          |
| GET    | `/api/connect-info` · `/api/ca-info` | proxy address · CA fingerprint           |
| WS     | `/ws`                             | live event stream                           |

The built web UI (`web/dist`) is mounted at `/` when present. Endpoints that publish (resume, drop, clear) are `async def` so they run on mitmproxy's own asyncio loop — the addon and API share one event loop and one store, so a publish from an HTTP handler reaches the same broadcaster.

**WebSocket events:** `flow.new` / `flow.complete` / `flow.error` / `flow.update`, `ws.message`, `sslproxying.update`, and `breakpoint.paused` / `resumed` / `dropped` / `timeout` / `breakpoints.update`.

## 3. UI — the React app (`web/`)

- **State:** a Zustand store (`store.ts`) holds the flow map, selection, active filter/client, and the ssl-proxying / breakpoints / paused / WebSocket‑frame collections. `visibleFlows()` applies the parsed filter + client selection.
- **Live updates:** the WebSocket client in `App.tsx` auto‑reconnects and calls `resync()` (flows, ssl-proxying, breakpoints, paused, and the selected ws flow's frames) on reconnect.
- **Filter DSL:** `filters/dsl.ts` parses queries like `status:>=400 host:*.soum.sa path:/v2/*` (plus `type:ws`) into a predicate; `filters/suggest.ts` powers autocomplete.
- **Viewers:** `JsonView` renders a collapsible, syntax‑highlighted tree plus a line‑numbered raw view, a format badge for decoded bodies, and a sandboxed Preview iframe; `WsMessages` streams WebSocket frames; `Timing` draws the per‑phase waterfall.
- **Components** map to UI regions: `TopBar`, `FilterBar`, `ClientsSidebar`, `FlowTable`, `DetailPane`, `StatusBar`, the `Devices` and `Dashboard` views, and modals (`ConnectDeviceModal`, `ReplayModal`, `Settings`, `BreakpointsModal`, `SSLProxyingModal`); paused flows edit inline via `PausedEditor` (sharing `HeaderRowsEditor` with `ReplayModal`).

## Data model (`mitmboard/models.py`)

A `Flow` carries request/response metadata, a `ClientRef` (ip, label, kind), `server_addr`, `tls_version`, a `Timing` breakdown (connect / TLS / TTFB / download), a `kind` (`http` / `ws`) with a `ws` summary, and a `modified` flag set when a breakpoint edit was applied. Request/response bodies carry `body_view` / `body_pretty` from the decoders. `Flow.meta()` returns the list‑view projection (bodies stripped) used by `/api/flows` and the WebSocket events.

## Desktop shell (`desktop/`)

A Tauri 2 app bundles the Python backend as a PyInstaller sidecar. On launch it picks free ports (proxy prefers 8080, UI 8081), spawns the sidecar, waits for the UI port, and loads it in a native window, killing the sidecar on exit. Releases are built for macOS, Windows, and Linux by the tag‑triggered `.github/workflows/release.yml`.

## Data & event flow — worked examples

Each example follows one request through the hooks, the store, and the `/ws` event stream. Records are the `Flow.meta()` projection the list view and events carry; the full detail (with bodies) comes from `GET /api/flows/{id}`.

### 1. A decrypted GET

A phone requests `https://api.soum.sa/v2/listings`.

1. `request` hook fires. The addon builds a pending record and publishes it, so the row appears before the response lands:

   ```json
   { "type": "flow.new", "flow": {
       "id": "a1b2", "method": "GET", "scheme": "https", "host": "api.soum.sa",
       "path": "/v2/listings", "client": { "ip": "192.168.1.29", "label": "Anthibo iPhone", "kind": "phone" },
       "kind": "http", "state": "pending", "response": null } }
   ```

2. `response` hook fires. The record is completed (status, sizes, per‑phase timing, decoded `body_view` if any) and re‑published:

   ```json
   { "type": "flow.complete", "flow": {
       "id": "a1b2", "response": { "status": 200, "content_type": "application/json", "size": 3120, "body_view": null },
       "state": "complete", "duration_ms": 142 } }
   ```

3. The UI upserts the row on each event (same `id`, no reordering). Clicking it calls `GET /api/flows/a1b2` for headers and the body; a Protobuf/gRPC/MsgPack body arrives pre‑rendered as `body_pretty` with a `body_view` badge.

### 2. A WebSocket connection

The app opens `wss://gateway.example.com/socket`.

1. The HTTP `101` upgrade is captured like any flow. `websocket_start` marks it `kind: "ws"` and publishes a `flow.update`; the row shows a live `ws` badge instead of a status.
2. Each frame triggers `websocket_message`. The frame is appended to the per‑connection `WsStore` (capped 500) with a preview and streamed:

   ```json
   { "type": "ws.message", "flow_id": "c3d4",
     "message": { "i": 0, "dir": "out", "type": "text", "size": 48, "view": "json",
                  "text": "{\"op\":\"subscribe\",\"topic\":\"orders\"}", "pretty": "{\n  \"op\": \"subscribe\", …" } }
   ```

   A throttled `flow.update` (≤ 4/s) keeps the row's frame count fresh. `websocket_end` publishes a final `flow.update` with the close code. The Messages tab loads history from `GET /api/flows/c3d4/ws?after=N` and appends live frames, merging by index so nothing is lost across a reconnect.

### 3. An excluded host (SSL Proxying Settings)

Instagram refuses the proxy's certificate, so the user enters `*.instagram.com` under **Proxy → SSL Proxying Settings → Exclude**.

1. The dialog expands the shorthand to `^.*\.instagram\.com(:\d+)?$` and writes the full list to `config.yaml` immediately. The API then calls `options.update(ignore_hosts=[...])`; `NextLayer` recompiles its matchers and the state is broadcast:

   ```json
   { "type": "sslproxying.update", "enabled": true,
     "exclude": ["(?i)google", "^.*\\.instagram\\.com(:\\d+)?$"],
     "revision": "8f2408530b7d4935" }
   ```

2. The next connection whose target `host:port` matches is forwarded encrypted and untouched at the proxyserver layer — **no HTTP flow is produced**, so nothing appears in the list. Already-established tunnels keep their earlier decision. Turning **Enable SSL Proxying** off sets `ignore_hosts` to a single match-all pattern without touching `config.yaml`.

3. If the file is edited externally, the next `GET /api/ssl-proxying` detects the new `revision`, replays it onto the running proxy and broadcasts — no restart. A concurrent UI write instead receives 409 and asks which side wins.

### 4. A breakpoint (pause → edit → continue)

<p align="center"><img src="media/breakpoint.gif" alt="A matching request pauses, a header is added, and it continues." width="640"></p>

A rule is armed: host `endpoint.soum.sa`, phase `request`.

1. A matching `request` pauses **only if a UI client is connected**. `BreakpointEngine.pause` calls `flow.intercept()` (mitmproxy holds the request), the record goes to `state: "paused_request"`, and two events fire:

   ```json
   { "type": "flow.update", "flow": { "id": "e5f6", "state": "paused_request" } }
   { "type": "breakpoint.paused", "entry": { "flow_id": "e5f6", "phase": "request",
       "rule_id": "r1", "since": 1757000000, "deadline": 1757000060 }, "flow": { "…full detail…" } }
   ```

2. The row jumps to a **Paused** group; the inline editor loads the detail. `POST /api/paused/e5f6/resume` with `{ "headers": [["x-debug","1"], …] }` runs on the event loop: `apply_request_edits` rewrites the retained mitmproxy flow, `flow.resume()` lets it continue to the origin, and the record is marked `modified: true`. The normal `response` hook then completes it as usual. `breakpoint.resumed` (or `breakpoint.dropped` for `POST …/drop`) clears it from the UI.
3. If no one acts within 60 s, the 1 s sweep auto‑continues it unchanged and publishes `breakpoint.timeout`. Clearing the store (`DELETE /api/flows`) also resumes anything paused, so a rule can never strand the device.
