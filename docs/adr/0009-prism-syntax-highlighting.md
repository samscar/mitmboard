# 语法高亮引入 prismjs，替换手写 tokenizer

**Status**: accepted

## Context

Contents 里 body 的呈现目前有两条着色路径，都不完整：

- `RawLines`（`web/src/components/JsonView.tsx`）承担行号 + 纯文本渲染，内嵌一个手写的 `markupTokens` 正则 tokenizer，只能给 HTML/XML 标签上一种颜色。
- `JsonView` 内的折叠树（`Node`/`Leaf` + `jv-*` 调色板）有完整的五类着色，但它是「可折叠树」形态，无行号，与 Charles 的 JSON Text（行号 + 着色文本）形态不同。

需求（scratch/response-content-viewer/spec.md）是 Contents 的 JSON tab 提供 Charles 式的行号 + 着色文本。这意味着需要按「行」产出 token：行号 gutter 与后续的查找条都要逐行操作（查找高亮需在 token 内做子串切分再嵌 `<mark>`）。

候选库的差异集中在意三点：体积（常驻加载的调试工具，加载性能敏感）、能否拿到 token 流自行拼行级 DOM（而不是吃进一整块 HTML 再反解）、JSON 与 HTML/XML 语法的覆盖。

## Decision

引入 **prismjs**（core + json + markup 语法）作为唯一的着色来源：

- 新增按行 token 渲染能力：prism 输出 token 流后按换行切分，逐行拼进现有 `RawLines` 的 gutter + line 结构。
- 配色沿用现有 `jv-*` 调色板（key/字符串/数字/布尔/null/标签），零新颜色。
- 删除手写 `markupTokens`，HTML/XML 的着色统一走 prism markup 语法。
- 现有 JSON 折叠树组件保留不动，仅与新的着色文本并存。

## Considered Options

- **手写正则 tokenizer（否决）**：十几行可覆盖 JSON 基本形态，但转义字符、嵌套字符串、跨行 token 等边缘情况要自己养；且 markup 侧已有一套手写实现，会形成两套着色逻辑。
- **highlight.js（否决）**：API 简单（一段 HTML 直接出），但包体积约 30–80KB，且输出整块 HTML，行级拆分需要反解其输出，与 gutter/查找的逐行模型相抵触。
- **shiki（否决）**：TextMate 语法、VS Code 级准确度，但体积 MB 级、同步初始化重，对抓包工具不友好。
- **prismjs（采纳）**：core + json + markup 约 2–5KB gzip，可拿 token 流自行拼行级 DOM，与现有渲染模型兼容性最好。

## Consequences

- 着色逻辑单一来源：JSON、HTML/XML 都经 prism；纯文本 body（Text/Raw）不过 tokenizer，保持原样。
- 查找条（scratch/response-content-viewer/issues/03-body-find-bar.md）建立在按行 token 结构之上，两者存在实现依赖：查找高亮在 token 内做子串切分。
- prism 的 token 粒度与 `jv-*` 调色板类别之间需要一个映射层；该映射是唯一的适配点。
- 引入一个真实 npm 依赖；升级 prism 需要回归 Contents 的 JSON/HTML 着色快照。
- 折叠树与着色文本并存是刻意的：树服务需要折叠语义的入口（Map Local 弹窗等），文本视图服务 Charles 对齐的 Contents。两者调色板同源，视觉一致。
