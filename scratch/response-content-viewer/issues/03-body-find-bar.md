# 03 — body 查找条（Find Next / Find Prev）

**What to build:** 在 Contents 的 request 与 response 两个 body 区各加一条 Charles 式查找条：viewer 底部一行，含放大镜图标、输入框、Find Next / Find Prev 按钮。作用域是当前一栏正在显示的 body viewer（Text / JSON / Raw 三者皆可搜，Headers 不可搜）。匹配语义为不区分大小写子串（spec D4）。全部匹配常驻高亮，当前命中加强调区分；Find Next / Find Prev 循环跳转并自动滚动到命中行。查找高亮需要在按行 token 结构（01 的产出）内做子串切分后嵌 `<mark>`，因此着色与高亮可以叠加。

交互细则以 spec「查找条行为细则」为准：Enter / Shift+Enter、wrap around、无匹配提示、切换流保留输入词并重算匹配、查找条默认折叠。

**Spec:** ../spec.md（D2/D3/D4 + 行为细则）

**Blocked by:** 01 — prismjs 集成与 JSON 着色文本

**Status:** ready-for-agent

- [x] Text / JSON / Raw 三个 body viewer 底部均有查找条；Headers 视图无
- [x] request、response 各自独立搜索，互不影响
- [x] 不区分大小写子串匹配；全部匹配常驻高亮，当前命中强化
- [x] Find Next / Find Prev 循环跳转并滚动到命中行；Enter / Shift+Enter 等效
- [x] 无匹配时输入框可见提示，不弹窗
- [x] 切换选中流或 viewer 后输入词保留、匹配重算
- [x] 着色文本内搜索时 token 颜色与 `<mark>` 高亮叠加正确
- [x] 前端测试覆盖：命中跳转、wrap、无匹配、跨流重算

## Comments

- 2026-11-08 落地：`FindBar.tsx`（底部条 UI）+ `highlight.ts` 的 `findMatches`/`countMatches`（按行、不区分大小写、不重叠）+ `RawLines` 的 `find` 属性（`<mark class="jv-find">` 继承 token 类名，当前命中加 `jv-find-current` 并 scrollIntoView）。查询词存 uiStore（跨流/跨 viewer 保留），命中序号存 DetailPane 本地并在文本或查询变化时重置。展开入口是 viewer 头部的放大镜按钮，Escape 或 ✕ 关闭。全量 204 测试通过，`tsc -b` 与生产构建干净。
