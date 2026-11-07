# 16 — 顶栏图标化与状态栏

**What to build:** 顶栏精简为图标：清空、重放，以及 Connect device、Export、Settings、Map Local。Breakpoints 按钮移到状态栏右下，功能不变。移除无法操作的静态 Recording 文字。

**Spec:** ../spec.md

**Blocked by:** 05 — Map Local 规则弹窗与顶栏入口；15 — 布局重排

**Status:** ready-for-agent

- [x] 顶栏只剩图标化的常用动作，每个都有悬停提示
- [x] Breakpoints 按钮在状态栏右下，指示点、暂停计数和弹窗功能不变
- [x] 不再出现静态的 Recording 文字
- [x] 前端 `App` 级测试与 Playwright 冒烟通过
