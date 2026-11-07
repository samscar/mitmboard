# 11 — 节点汇总：Overview 与 Summary

**What to build:** 选中 host 或目录节点时，右侧不再是「Select a request」，而是该节点的 Overview 和 Summary：请求数、状态分布（2xx/3xx/4xx/5xx）、总流量、平均耗时与 P95。Summary 复用现有的统计函数。

**Spec:** ../spec.md

**Blocked by:** 08 — 树的选中语义与键盘导航；10 — 详情页：Contents 分屏与 Notes

**Status:** ready-for-agent

- [x] 选中 host 或目录显示 Overview 与 Summary，数字与该节点下的流量一致
- [ ] 流量更新时汇总随之更新
- [x] 选回具体请求时恢复请求详情
- [x] 前端 `App` 级测试覆盖
