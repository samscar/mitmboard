# spec — response-content-viewer

## 问题

对照 Charles 5.2.2 的 Contents，Mitmboard 的 response（及 request）body 查看存在两个缺口：

1. **无着色**：JSON tab 用 `JsonBody` → `RawLines` 渲染纯白文本 + 行号，字段与值无颜色区分。彩色折叠树（`JsonView`）已存在但形态是树、无行号，且未接到 Contents。
2. **无查找**：body 只能 Copy；想搜某个字段只能把整个 body 复制出去。Charles 在 viewer 底部提供查找条（Find Next / Find Prev）。

## 决策（2026-11-08 grilling 收敛）

| # | 决策点 | 结论 | 被否决的备选 |
| --- | --- | --- | --- |
| D1 | JSON tab 形态 | **Charles 式着色文本**：行号 + 按 token 类型着色的纯文本 | 彩色折叠树（形态偏离 Charles）；Text/Tree 双子视图（首版不加） |
| D2 | 查找范围 | **request 与 response 的 body**，覆盖 Text / JSON / Raw 三个 body viewer；Headers 不搜 | 仅 response；整个 Contents 含 Headers |
| D3 | 查找交互 | **Charles 式底部查找条**：输入 + Find Next / Find Prev，全部匹配常驻高亮 | Cmd+F 浮层；过滤式（隐藏不匹配行） |
| D4 | 匹配语义 | **不区分大小写子串**，无正则、无开关 | 区分大小写；正则/大小写开关 |
| D5 | 大响应 | **先不设防**：全量渲染 + 全量高亮，不虚拟滚动、不超限降级 | 虚拟滚动；超阈值（如 1MB）降级为 Raw |
| D6 | 高亮实现 | **引入 prismjs**，见 ADR 0009；删除手写 `markupTokens`，HTML/XML 统一走 prism | 手写正则 tokenizer；highlight.js；shiki |
| D7 | 配色 | **沿用现有 `jv-*` 调色板** | 复刻 Charles 配色 |
| D8 | 组件去留 | 折叠树组件**保留不动**，与着色文本并存 | 随旧入口下线 |
| D9 | issue 组织 | 单 feature `scratch/response-content-viewer/`，三张 issue | 拆两个 feature |

## 查找条行为细则（D3/D4 的展开）

- 布局镜像 Charles：viewer 底部一条，含放大镜图标、输入框、Find Next / Find Prev 按钮；request、response 各自一条，只作用于自己一栏的当前 body viewer。
- 快捷键：输入框内 Enter = Find Next，Shift+Enter = Find Prev。
- 匹配到达末尾后回绕到开头（wrap around），反向同理；当前命中与其余匹配用两种高亮强度区分。
- 无匹配时输入框给出可见提示（红框或 0 results 计数），不弹窗。
- 切换选中流或切换 body viewer 时：保留输入词，重新计算匹配，定位到第一个匹配。
- 搜索词不跨会话保留；查找条默认折叠，点击放大镜或按快捷键展开（展开快捷键首版不绑定全局键，避免与浏览器 ⌘F 冲突）。

## 非目标

- Headers、Overview 等非 body 区域的查找。
- 正则匹配、大小写开关、字段名/值语义化搜索（如 JSON Path）。
- 大响应的虚拟滚动与超限降级（D5 明确先不设防，实测卡顿再立项）。
- 折叠树的任何改动（D8）。
- WS 消息视图（WsMessages）的着色与查找，另行立项。

## Issues

- `issues/01-prism-json-colored-text.md` — prismjs 集成 + JSON 着色文本
- `issues/02-unify-markup-highlighting.md` — markup 着色统一换库，删 `markupTokens`
- `issues/03-body-find-bar.md` — body 查找条
