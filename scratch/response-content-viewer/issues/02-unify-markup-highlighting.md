# 02 — markup 着色统一换库，删除手写 markupTokens

**What to build:** 删除 `JsonView.tsx` 里的手写 `markupTokens` 正则 tokenizer，HTML/XML 内容的着色统一改走 prism markup 语法（01 已引入并建好按行渲染）。判定逻辑不变：`Content-Type` 含 html/xml 时启用。Text / Raw 等非 markup、非 JSON 的纯文本 body 不过 tokenizer，保持原样。

**Spec:** ../spec.md（D6）

**Blocked by:** 01 — prismjs 集成与 JSON 着色文本

**Status:** ready-for-agent

- [x] `markupTokens` 及其正则删除，无残留引用
- [x] HTML/XML body 在 `RawLines` 中由 prism 着色（标签类别映射 `jv-tag` 色）
- [x] 纯文本 body（如 plain text）着色行为与 01 之前一致（无色）
- [x] 现有 markup 相关前端测试更新并通过

## Comments

- 2026-11-08 落地：`RawLines` 的 `markup` 布尔参数改为 `lang="markup"`，`markupTokens` 删除。prism 的 markup `tag` token 是嵌套结构，flatten 时子片段无自身类名则继承父级类（`<body` 的标签名仍读作 tag，属性名 jv-key、属性值 jv-string）。全量 194 测试通过，`tsc -b` 干净。
