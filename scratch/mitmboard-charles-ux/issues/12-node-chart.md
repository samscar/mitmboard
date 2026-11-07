# 12 — 节点 Chart

**What to build:** 节点详情增加 Chart 标签，复用 `DashboardView` 里的状态分布条形图展示该节点下的请求分布（Dashboard 页在票 15 移除时把这张图抽成独立组件）。优先级最低，可在 Summary 之后随时交付。请求级的 Chart 不在本批——Charles 的请求 Chart 是时间线图，依赖后端没有的「相关请求」关系。

**Spec:** ../spec.md

**Blocked by:** 11 — 节点汇总：Overview 与 Summary

**Status:** ready-for-agent

- [x] 选中节点后出现 Chart 标签，显示状态分布
- [x] 数据与 Summary 一致
- [x] 前端 `App` 级测试覆盖
