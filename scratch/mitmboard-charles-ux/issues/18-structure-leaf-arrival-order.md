# 18 — Structure 树叶子按到达顺序排列（旧上新下）

**What to build:** Structure 视图中，同一节点下的多条请求（叶子）按到达顺序排列：先来的在上，新流量追加到列表末尾，与 Charles 的 Structure 树一致。现状是新流量插在最上方——根因是 store 的 `visibleFlows()` 为 Sequence 视图按新→旧返回，而 `StructureTree.buildTree()` 直接按该顺序 push 叶子。修复保持在 StructureTree 内部把输入反转为旧→新，不动 store（Sequence 的"新在最上"不变）。host 与目录节点之间维持按名称字母序，不因新流量改变位置。

**Spec:** ../spec.md

**ADR:** docs/adr/0010-structure-leaves-arrival-order.md

**Status:** ready-for-agent

- [x] 同一接口下新流量追加到叶子列表末尾，先到的请求保持在上方
- [x] host/目录节点之间仍是字母序，位置不受新流量影响
- [x] Sequence 视图保持新流量在最上方
- [x] 前端测试覆盖：叶子到达顺序断言（含新流量到达场景）

## Comments

- 2026-11-08：修复落地于 `StructureTree.tsx`（`buildTree([...rows].reverse())`），store 未动。TreeFocus.test.tsx 三个依赖渲染顺序的测试同步翻转预期并新增叶子到达顺序断言；套件 209 过 208，唯一失败（FlowTable 空态文案）属工作区另一组进行中的改动，与本 issue 无关。决策记录见 docs/adr/0010，术语排序语义已并入 CONTEXT.md 的 Structure/Sequence 视图词条。
