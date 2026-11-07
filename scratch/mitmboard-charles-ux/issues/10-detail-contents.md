# 10 — 详情页：Contents 分屏与 Notes

**What to build:** 选中一条请求时，标签栏上方显示 `METHOD URL → 状态码`，标签改为 Overview / Contents / Summary / Notes：Summary 就是把现有 `Timing` 相位表改名为 Summary 并保留，不做 SSL 标签，也不做请求级 Chart。Contents 上下分屏：上为请求、下为响应，各有子标签。请求侧：Headers、Query String、Cookies、Text、JSON、Raw；响应侧：Headers、Text、JSON、Raw。请求与响应的 headers 分别显示，解决现在合并显示的问题。Map Local 命中信息搬到 Notes；规则已被删除时显示「Mapped to local file: …（rule deleted）」，文件名取自命中时写入的快照。Overview 里的「Client」行改名「Device」。暂停请求的内联编辑器仍在选中暂停请求时显示。

**Spec:** ../spec.md

**Blocked by:** 03 — Map Local 命中标记

**Status:** ready-for-agent

- [ ] 标题行与标签符合上述规则；Summary 标签的内容就是现有的 Timing 相位表
- [ ] Contents 请求在上、响应在下，各子标签内容正确，headers 不再混在一起
- [ ] 命中信息显示在 Notes；规则已删除时仍显示快照路径并标注 rule deleted
- [ ] Overview 中显示「Device」
- [ ] 暂停请求的编辑与放行流程不受影响
- [ ] 前端 `App` 级测试覆盖
