# 14 — 直通弹窗

**What to build:** 点击顶栏已有的「N passthrough」标签，打开直通弹窗，列出主机、状态（watching / pinned / config）与 Retry，行为与现在侧栏里的直通列表一致。这是设备栏移除之前先让直通管理有新位置。

**Spec:** ../spec.md

**Blocked by:** 01 — 前置修复：`-s` 参数与 mitmproxy 版本

**Status:** ready-for-agent

- [ ] 标签可点击，弹窗内容与现有直通列表一致
- [ ] Retry 对可重试的主机生效，失败时给出内联错误提示
- [ ] 配置里的主机显示 config 标记且不可 Retry
- [ ] 前端 `App` 级测试覆盖
