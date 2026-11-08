# 页面内渲染菜单栏，对齐 Charles 的入口结构

**Status**: accepted

## Context

Charles 的全部功能入口都挂在 macOS 系统菜单栏的八个菜单里（Charles / File / Edit / View / Proxy / Tools / Window / Help），窗口工具栏上的每个图标都是某条菜单命令的镜像——图标之所以可辨识，是因为菜单充当了它的图例。Mitmboard 此前的做法相反：顶栏放了六个自绘图标、只有 tooltip、背后没有菜单，于是这些图标「意义不明」，成为 UI 反馈最集中的一处。

要复刻 Charles 的入口路径，最直觉的载体是 Tauri 原生菜单（`Menu` API 可生成真正的 macOS 菜单栏）。但它被两件已定案的事实挡住：

- ADR 0005 已决定只交付 Web 应用，桌面壳暂停；原生菜单栏在浏览器里不存在。
- CONTEXT.md 场景 B（无图形界面的云主机）只能通过浏览器访问，UI 的每一个入口都必须在浏览器里可达。

同时浏览器进程本身占用了 Charles 的大部分快捷键（⌘R 刷新、⌘T 新标签、⌘N 新窗口、⌘0–⌘9 切标签），照抄 Charles 的快捷键要么绑不上、要么会误导。

## Decision

菜单栏以**页面内 HTML** 渲染（`web/src/components/Menu*` / `menuModel.ts`），完整保留 Charles 八个顶级菜单的骨架与条目顺序；Mitmboard 尚未实现的条目照常列出、置灰并以 "Not implemented yet" 提示，架构上不可能出现的条目（Publish Gist、向 Java VM / iOS 模拟器安装证书）不列出。菜单不显示快捷键。工具栏镜像 Charles 的图标排布（Structure/Sequence、Clear/Compose/Repeat、Proxying/Record/SSL/Throttle/Breakpoints），未实现者置灰；Tools 菜单中实际生效的工具（Map Local）带勾选标记，与 Charles 的勾选行为一致。

## Considered Options

- **Tauri 原生菜单栏**：只有桌面壳可用，覆盖不到唯一的交付形态（ADR 0005）与场景 B；若恢复桌面端需要先完成「从 app 源加载 UI」重构。
- **只保留工具栏、不做菜单**：正是本轮要修的问题——图标无可发现的文字入口。
- **页面内菜单栏（采纳）**：浏览器与未来的桌面壳共用同一份实现，入口路径与 Charles 一一对应。

## Consequences

- 每个弹窗（Settings / Map Local / Breakpoints / Passthrough / Connect）可能从菜单、工具栏、状态栏三处打开，故由 `uiStore` 统一持有打开状态，`Dialogs` 组件单一渲染。
- 置灰条目是产品路线的公开承诺：实现某项功能时，只需把 `menuModel.ts` 里对应的 `todo(...)` 换成 `cmd(...)`。
- 菜单条目与 Charles 5.2.2 对齐（依据为其 `charles.jar` 的菜单定义），Charles 升级若调整菜单，需人工比对本文件。
- 快捷键不做对齐；若将来桌面壳恢复，可按平台补快捷键列而不动菜单结构。
