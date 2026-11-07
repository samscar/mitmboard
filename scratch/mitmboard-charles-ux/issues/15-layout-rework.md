# 15 — 布局重排

**What to build:** 页面变为「左边树、右边详情」：移除设备栏（含设备手动改名入口）、Devices 页和 Dashboard 页，顶层只剩 Inspector；Structure/Sequence 切换移到树面板顶部，过滤框移到树面板底部。同时修正 Playwright 冒烟测试的选择器，并删除或改写与被移除功能相关的旧测试。

**Spec:** ../spec.md

**Blocked by:** 12 — 节点 Chart；13 — `device:` 过滤与自动补全；14 — 直通弹窗

**Status:** ready-for-agent

- [ ] 设备栏、Devices 页、Dashboard 页不再出现
- [ ] 切换在树面板顶部，过滤框在树面板底部，行为不变
- [ ] 按设备筛选与直通管理仍可通过 `device:` 和直通弹窗完成
- [ ] 旧测试已删除或改写，Playwright 冒烟通过
