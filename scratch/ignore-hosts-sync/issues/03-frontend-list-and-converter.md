# 03 — 前端：单一列表、Charles 式交互与转换面板

**Spec:** ../spec.md
**Blocked by:** 02

**Status:** resolved (2026-11-09)

## What to build

1. **删除只读区**：移除 `.sslproxy-base` 区块与其说明文案；`types.ts` / `store.ts` / WS 事件去掉 `base`，加入 `revision`。单一列表渲染 `config.yaml` 的全部 regex，按文件顺序。
2. **修掉 `1…` 截断**：给排除行专用类名，不复用 `.bp-row` 的 6 列 grid；`theme.css:811` 的相邻兄弟选择器缺陷一并移除。等宽字体、自动换行、完整显示；`title` 保留完整值。
3. **Charles 式交互（只借鉴模式）**：Add 插入可编辑行；已有条目行内编辑（Edit 按钮或双击）；每行删除控件；无 Host / Port 两列，单列仍是原始 regex。Include tab 保持置灰占位。
4. **取消 Save/Cancel**：只留 Close；每次 Add / Update / Delete / 勾选即时调用写入端点并显示「已同步 / 未同步」与错误。移除 `dirty` 草稿保护。
5. **Add 框内联预览**：输入通配符速记（如 `10.53.*.*`）时实时展示展开后的规范 regex `^10\.53\..*\..*(:\d+)?$`；直接输入原始 regex 时原样保留。落盘的都是 regex。
6. **独立「转换为 Regex」面板**（对话框内按钮，不新增顶级菜单）：批量粘贴多条速记、逐条输出规范 regex、复制、一键加入排除、试匹配输入框（输入 `host:port` 看是否命中）、`re.compile` 校验、可选「仅 HTTPS :443」开关（输出 `^…:443$`）。不自动改写文件中已有的手写 regex。
7. **冲突与广播**：收到 conflict 响应时展示「以文件为准重载 / 以我的列表覆盖」；收到 `sslproxying.update` 广播时用服务端 revision 刷新本地基准与列表，不误报冲突。
8. **颜色与字体复用 `theme.css` 变量**，不硬编码（CONTRIBUTING.md）。

## Acceptance

- [ ] 长 regex 与 IP 完整可见，不再出现 `1…`
- [ ] 页面无只读区、无 `base` 字段残留
- [ ] Add / 行内编辑 / 删除即时写盘，界面显示同步状态；失败显示原因
- [ ] 输入 `10.53.*.*` 预览为 `^10\.53\..*\..*(:\d+)?$`，落盘为该 regex
- [ ] 转换面板支持批量、复制、一键加入、试匹配、非法 regex 拦截、`:443` 开关
- [ ] 冲突时两个显式动作各自行为正确；多标签页广播不误报
- [ ] Include tab 仍置灰；组件测试覆盖新增交互

## Comments

2026-11-09 实现：`SSLProxyingModal.tsx` 重写为单一可编辑列表 + 逐操作写盘 + 同步状态 + 冲突双动作；新增 `web/src/sslProxying.ts`（转换、试匹配、Python 内联 flag 归一化）；`theme.css` 删除导致 `1…` 的 `.bp-row` 网格与 ellipsis，改用 `.sslproxy-row` 等宽换行。Add 框提供「通配符速记 / 原始 Regex」显式切换与实时预览，避免猜测输入类型；转换器支持批量、复制、试匹配、`:443`。`web/dist` 已重建。
