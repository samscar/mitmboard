# 01 — Ctrl+C / SIGTERM 退出时不再刷 traceback

**Status:** resolved (2026-11-09)

## What to do

终端按 Ctrl+C 结束 `mitmboard` 时，stderr 出现 1 条 lifespan
`asyncio.exceptions.CancelledError` 栈，外加每个活跃 `/ws` 连接一条
`Exception in ASGI application` 栈（N 个浏览器标签 = N 条）。SIGTERM 同构。

根因（实测基线：uvicorn 0.54.0 / starlette 1.10.0 / Python 3.13.12）：
`mitmdump` 用 `asyncio.run(main())` 驱动；addon 的 `running()` 把 uvicorn
`serve()` 与 `_sweep_loop()` 用 `ensure_future` 挂在同一个事件循环上，既没
保存强引用、也没有关停钩子。Ctrl+C 时 uvicorn `handle_exit` 置
`should_exit=True`，随后 mitmproxy `Master.shutdown` 让 `main()` 返回，
`asyncio.Runner.close()` 在约 0.3 ms 内直接 cancel 全部残留 task ——
`uvicorn.Server.shutdown()` 从未执行。wsproto 的 `run_asgi` 用
`except BaseException` 捕获 `CancelledError` 并打印完整栈。

修复：

1. `mitmboard/addon.py`：`running()` 保存 Server 与两个 task 的强引用，
   `Config(..., timeout_graceful_shutdown=1.0)`；新增 `async def done()`
   （mitmproxy `DoneHook` 在 `master.run()` 的 finally 里 await），显式置
   `should_exit=True` → await `serve_task`（2 s 外层预算）→ cancel/await
   `_sweep_task`；`_publish` 的 done callback 跳过已取消 future。
2. `mitmboard/server.py`：`_run_ws_loop` 增 `except asyncio.CancelledError`，
   作为取消穿透 ASGI 框架的第二道防线。
3. 回归：`tests/test_server.py` 4 个单元用例 + `tests/test_shutdown.py`
   端到端（SIGINT / SIGTERM，各 2 个 WS 连接）。

不改：依赖版本、CLI、单进程共享事件循环架构、前端 `web/src/ws.ts`
（uvicorn 原生 shutdown 发 close 1012，既有退避重连保持不变）、
`broadcaster.publish` 的 `except Exception`。桌面端 SIGKILL 无法拦截，
明确不覆盖。

## Acceptance

- [x] Ctrl+C 后 stderr 无 `Traceback` / `CancelledError` /
      `Exception in ASGI application` / `ERROR:`
- [x] 退出码 0，2 秒内退出
- [x] SIGTERM 行为一致
- [x] 多个 WS 连接时错误数不随连接数增长
- [x] 新增单元与端到端用例全部通过

## Comments

2026-11-09：实测注入 `done()` 后 `uvicorn.Server.shutdown()` 正常返回
（约 0.10 s）、`Runner.close` 残留 task 归零、三组实验错误归零、退出码 0、
耗时 0.24–0.34 s。`capture_signals` 正常返回会重放信号并二次触发
`Master.shutdown`，幂等无害。

人工复现（真实 CLI + 2 个 WS 连接 + SIGINT）：退出码 0、0.337 s、
终端仅剩 2 行启动日志，四类错误串均 absent。

在 HEAD 干净副本上只重放本票改动后运行全量 pytest：204 passed /
1 skipped；唯一失败 `test_apply_ssl_proxying_sets_ignore_hosts_option`
在未改动的 pristine HEAD 上同样失败，属既有问题。当前工作区另有 ADR 0014
（`scratch/ignore-hosts-sync/`）在途重构，`tests/test_sslproxy.py` 收集期
ImportError 与 15 个 `ssl_proxying` 用例失败均属该重构，与本票无关。
