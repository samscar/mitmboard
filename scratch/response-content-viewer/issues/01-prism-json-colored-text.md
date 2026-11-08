# 01 — prismjs 集成与 JSON 着色文本

**What to build:** 按 ADR 0009 引入 prismjs（core + json + markup），给 `RawLines` 增加按行 token 渲染能力：prism 输出 token 流后按换行切分，逐行渲染进现有 gutter + line 结构，token 类别映射到现有 `jv-*` 调色板。把 `DetailPane.tsx` 的 `JsonBody` 从 `JSON.stringify` + 纯文本 `RawLines` 改为着色文本视图（仍先 parse + 格式化，parse 失败回退现有纯文本渲染）。request 侧 `reqTab === "json"` 同样生效。折叠树组件（`JsonView` 的 `Node`/`Leaf`）不动。

**Spec:** ../spec.md（D1/D6/D7）

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [x] `web/package.json` 新增 prismjs，仅引 core + json + markup，未拖入其他语言组件
- [x] JSON tab 呈现行号 + 着色文本：键、字符串、数字、布尔、null 五类颜色沿用 `jv-key`/`jv-string`/`jv-number`/`jv-boolean`/`jv-null`
- [x] 行为与现有一致：仍按两空格缩进格式化，gutter 行号对齐
- [x] body 非法 JSON 时回退纯文本 `RawLines`，无报错、无空白屏
- [x] 二进制 body（`body == null`）仍显示 `binary body, N bytes` 占位
- [x] 折叠树及其 Collapse all 入口行为不变
- [x] 前端测试覆盖：着色文本渲染（含 token 类别断言）与非法 JSON 回退

## Comments

- 2026-11-08 落地于 `web/src/json/highlight.ts`（tokenizeLines）与 `JsonView.tsx` 的 `RawLines lang` 属性；`JsonBody` 改走 `lang="json"`，非法 JSON 回退纯文本。prism 的 token 文本含引号（`"retcode"`），测试按此断言。`npm test`（相关三文件）与 `tsc -b` 全绿。
