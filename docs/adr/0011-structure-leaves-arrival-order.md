# Structure 树叶子按到达顺序，Sequence 保持新上

**Status**: accepted

## Context

自测发现（scratch/mitmboard-charles-ux/issues/18-structure-leaf-arrival-order.md）：Structure 视图中同一接口后续进来的新流量展示在节点叶子列表的**最上方**，而 Charles 的 Structure 树把新请求**追加到末尾**。

根因是两个视图共用一条数据路径但各自需要相反的顺序：

- `store.ts` 的 `order` 数组按到达顺序（旧→新）追加流量 id；`visibleFlows()` 遍历时倒序返回（新→旧），这对 Sequence 视图是正确的——Charles 的 Sequence 列表新流量在最上方。
- `StructureTree.buildTree()` 直接按 `rows` 的给定顺序把流 push 进各节点的 `leaves`，于是叶子继承了对 Structure 视图错误的"新→旧"顺序。

两个候选修法：改 store 为 Structure 提供另一条顺序，或在 StructureTree 内部反转输入。

## Decision

**Structure 树的叶子按到达顺序排列（旧上新下）；顺序反转只发生在 StructureTree 内部，store 不动。**

- `buildTree` 的输入改为 `[...rows].reverse()`：Sequence 与 Structure 各取所需，`visibleFlows()` 的语义（为新→旧的平铺列表服务）保持单一。
- host 与目录节点之间维持按名称字母序（`localeCompare`），与 Charles 一致；叶子顺序的改动不影响节点位置，因为文件夹本来就会重新排序。
- Sequence 视图不变：新流量仍在最上方。

## Considered Options

- **store 增加时序版本方法（否决）**：为单一消费者加一条近乎重复的遍历路径，两个调用点谁返回哪种顺序变得需要查文档才知道；且 store 层的"新→旧"约定已在 FlowTable 与多处测试中固化。
- **StructureTree 内部反转输入（采纳）**：一行改动，影响面被树的 buildTree 局部化；叶子顺序与 Charles 对齐这一意图写在反转处的注释里，不扩散到 store。

## Consequences

- Structure 与 Sequence 的排序语义从此不对称且是刻意的：Sequence 新上（时间线直觉），Structure 旧上新下（聚合树直觉，与 Charles 一致）。两者都被术语表（CONTEXT.md 界面视图节）固定下来。
- 依赖渲染顺序的键盘导航测试（TreeFocus.test.tsx 箭头导航）的预期需要随叶子顺序翻转。
- 若未来出现第三个需要"旧→新平铺"的消费者，届时再考虑把反转下沉为 store 方法；单消费者阶段不做。
