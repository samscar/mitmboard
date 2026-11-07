# 07 — 已命中请求的右键：编辑或停用规则

**What to build:** 对已被 Map Local 命中的请求右键，「Map Local…」变成「编辑 Map Local 规则…」和「停用该规则」，直接定位到命中的那条规则，而不是再建一条重复的。

**Spec:** ../spec.md

**Blocked by:** 03 — Map Local 命中标记；05 — Map Local 规则弹窗与顶栏入口

**Status:** ready-for-agent

- [ ] `MAPPED` 请求的右键菜单显示上述两项，不再显示「Map Local…」
- [ ] 「编辑…」打开规则对话框并载入命中的规则
- [ ] 「停用该规则」后规则变为未启用，后续请求不再命中
- [ ] 前端 `App` 级测试覆盖
