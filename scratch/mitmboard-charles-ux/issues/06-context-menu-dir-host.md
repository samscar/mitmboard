# 06 — 目录与 host 右键、预填粒度、其余菜单项

**What to build:** Structure 视图的目录和 host 节点也支持右键，并能直接建 Map Local 规则；请求行菜单补全 Copy URL、Copy cURL、Replay、Edit & Resend。预填粒度：目录为 host 加 `该目录/*`、method 为 any；host 为只填 host。目录没有现成的响应可存，因此从目录进入时「使用已捕获的响应」置灰、状态码默认 200。目录的菜单只有 Map Local…——Focus 只出现在 host 与请求行上。断点与直通的菜单位置预留，本批不接。

**Spec:** ../spec.md

**Blocked by:** 02 — 右键请求行建 Map Local（使用已捕获的响应）

**Status:** ready-for-agent

- [x] 目录与 host 右键菜单含「Map Local…」，预填值符合粒度规则；目录菜单不含 Focus
- [x] 从目录或 host 进入对话框时「使用已捕获的响应」置灰、状态码默认 200
- [x] 请求行菜单含 Copy URL、Copy cURL、Replay、Edit & Resend，行为与详情页按钮一致
- [ ] 菜单可用 Esc 或点击空白处关闭
- [x] 前端 `App` 级测试覆盖
