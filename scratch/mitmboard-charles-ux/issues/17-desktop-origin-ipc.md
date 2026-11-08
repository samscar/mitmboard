# 17 — 桌面端改从 app 源加载界面，再接原生文件选择

**What to build:** 桌面壳目前把窗口 `navigate` 到 `http://127.0.0.1:<web_port>`（`desktop/src-tauri/src/lib.rs`），界面因此跑在远程 http 源上，Tauri 不注入 IPC。改为把 `web/dist` 打进 bundle、用 app 源加载界面，再引入 `tauri-plugin-dialog`：Map Local 对话框的「Choose file…」在桌面端弹原生选择器，直接回填绝对路径；浏览器端保持上传到托管目录。接口调用需要解决同源问题（给 FastAPI 加 CORS 白名单，或走 Tauri 的 http 转发），后端仍由 sidecar 提供。

**Spec:** ../spec.md（Story 50、spec:117）；决策背景见 `docs/adr/0004-desktop-file-picking.md`

**Blocked by:** None — 但需要 Rust 工具链与本机打包验证；本仓库当前环境没有 `cargo`。

**Status:** wontfix

桌面端已暂停交付（见 `docs/adr/0005-web-only.md`）。若恢复桌面端，先做「从 app 源加载 UI」的重构，本票再重新评估。

- [ ] 窗口从 app 源加载，界面与 API 全部可用（CORS 或转发方案落地）
- [ ] 桌面端「Choose file…」返回原文件绝对路径，不复制进托管目录
- [ ] 浏览器端行为不变：仍上传到 `~/.mitmboard/maplocal/` 并回填
- [ ] 原生选择器取消时对话框不报错、字段保持原值
- [ ] `docs/adr/0004-desktop-file-picking.md` 更新为已被取代，或补一条新 ADR
