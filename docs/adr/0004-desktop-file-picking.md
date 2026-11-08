# 桌面端不做「直接选本机文件」，统一走上传到托管目录

**Status**: superseded by `0005-web-only.md`（桌面壳已暂停；上传与手输路径的结论仍然有效）

v1 spec 要求 Map Local 的文件字段在桌面环境「直接选本机文件」、在浏览器环境上传后回填。实现核查后发现桌面端当前拿不到这个分支：

- 桌面壳先显示 splash，再把窗口 `navigate` 到 `http://127.0.0.1:<web_port>`（`desktop/src-tauri/src/lib.rs`），因此界面运行在一个**远程 http 源**上，不是 Tauri 的 app 源。Tauri v2 默认不向远程源注入 IPC，要用就得显式开放远程域 IPC——而那个端口由本机任意进程都能监听，等于把窗口权限交给「谁先占了端口」。
- `tauri.conf.json` 里 `withGlobalTauri: false`，且没有 `tauri-plugin-dialog`，没有可用的文件选择 API；本仓库也未安装 `@tauri-apps/api`。
- 构建环境没有 `cargo`，任何 Rust 侧改动都无法编译或验证。

决定：**两种环境都上传到托管目录**，文件字段旁明确写出「选择文件会复制到 Mitmboard 的托管目录；要原地引用本机文件，直接输入绝对路径」。用户真正想要的两件事——用一个本机文件做 mock、以及不被复制——分别由「上传」和「手输路径」覆盖，只是桌面端不再是「一次点击拿到原路径」。

## Considered Options

- **开放远程域 IPC + `tauri-plugin-dialog`**：一次点击即可选到原路径，但把 IPC 暴露给本机任意进程可抢占的端口，安全边界换来的收益只是一个点击；且本环境无法编译验证。
- **把 web/dist 打进 bundle，从 app 源加载界面**：长期正解——IPC 回到同源、安全模型干净，还能顺带去掉 splash 中转；但这是一次桌面壳重构，不属于本批。
- **后端起一个原生文件选择器**：sidecar 是 Python，无 GUI 依赖，云端场景也不适用。

## Consequences

- 桌面端的「选择文件…」实际是复制进 `~/.mitmboard/maplocal/`，与浏览器行为一致；对话框里已写明这一点。
- 需要原地引用、或文件超过 20 MB 时，用手输绝对路径，这条路径永远不被清理。
- 若将来桌面壳改为从 app 源加载 UI，可以直接接 `tauri-plugin-dialog`，本 ADR 随之失效。
