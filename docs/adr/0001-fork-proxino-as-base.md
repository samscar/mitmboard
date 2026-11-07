# 以 Proxino 为二次开发基座

**Status**: accepted

本项目的两个场景都要求「浏览器可访问 + 基于 mitmproxy 的抓包界面」，自研前端成本过高。决定 fork `anthibo/proxino`（MIT）作为基座，而不是自研或更换工具。

Proxino 已经具备断点、重放、WebSocket 帧、HAR 导出、逐设备分组这五项能力，自研需要 1~2 周。它缺的恰好是本项目 v1 需要的两块：Map Local 与 Structure 视图，属于本地增量而非架构改造。许可为 MIT，允许闭源改造，无需开源自身修改。

## Considered Options

- **自研 addon + 前端**：架构完全可控，但多出 1~2 周且要自己处理断点、重放、WebSocket 帧这些已有实现。
- **mitmweb + 只写 addon**：改动最小，但 mitmweb 的前端无法提供 Structure 视图，而这是明确的使用习惯依赖。
- **RelayCraft / Lanius**：均为 Tauri 桌面壳，场景 B 的无图形环境无法运行；且 RelayCraft 为 GPL-3.0，复制代码会传染整个项目。

## Consequences

- 上游最后一次提交是 2026-09-12，之后无活动。本项目承接全部演进，不再期待上游修复。
- 动工前必须修 `proxino/cli.py` 的 `-s` 逻辑：只要传入任何 `-s`，它就不再加载自身 addon，界面会直接消失。
- 必须把 `mitmproxy` 依赖从 `>=11` 钉到具体版本，避免 addon API 漂移。
- Map Local 与 Structure 视图需要同时改 Python 侧（addon、server、config）与 `web/` 前端，不只是一处。
