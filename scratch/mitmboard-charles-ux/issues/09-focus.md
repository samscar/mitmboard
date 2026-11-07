# 09 — Focus（Charles 式，host 级多目标）

**What to build:** 在 host 上右键选 Focus，或在请求行右键 Focus（作用于该请求所属的 host）：Structure 视图里被关注的 host 置顶，其余 host 收进 Other Hosts 文件夹而不是消失；Sequence 视图提供 Focused 开关。Focus 是多目标集合——可以同时关注多个 host，各自置顶，Other Hosts 收的是全部未关注的 host，这与 Charles 的 `Focused Hosts…` 列表一致。Focus 与过滤框的查询取交集；Esc 一次清除全部 Focus，再按一次清除选中；也可以从菜单取消 Focus。目录级 Focus 不做：Charles 只对 host 提供 Focus。

**Spec:** ../spec.md

**Blocked by:** 06 — 目录与 host 右键、预填粒度、其余菜单项；08 — 树的选中语义与键盘导航

**Status:** ready-for-agent

- [ ] Focus 后被关注的 host 置顶，其余收进可展开的 Other Hosts
- [ ] 同时关注两个 host 时两者都置顶，取消其中一个后另一个仍在顶部
- [ ] Sequence 视图的 Focused 开关只显示被关注的流量
- [ ] 与过滤框查询取交集
- [ ] Esc 一次清全部 Focus、再按一次清选中；也可通过菜单取消 Focus
- [ ] 前端 `App` 级测试覆盖
