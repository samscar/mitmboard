# 09 — Focus（Charles 式）

**What to build:** 在 host（以及目录）上右键选 Focus：Structure 视图里被关注的节点置顶，其余 host 收进 Other Hosts 文件夹而不是消失；Sequence 视图提供 Focused 开关。Focus 与过滤框的查询取交集；Esc 先清除 Focus，再清除选中；也可以从菜单取消 Focus。请求行右键同样有 Focus。官方文档只定义了 host 级 Focus，目录级是我们的扩展。

**Spec:** ../spec.md

**Blocked by:** 06 — 目录与 host 右键、预填粒度、其余菜单项；08 — 树的选中语义与键盘导航

**Status:** ready-for-agent

- [ ] Focus 后被关注节点置顶，其余收进可展开的 Other Hosts
- [ ] Sequence 视图的 Focused 开关只显示被关注的流量
- [ ] 与过滤框查询取交集
- [ ] Esc 先清 Focus、再清选中；也可通过菜单取消 Focus
- [ ] 前端 `App` 级测试覆盖
