# 13 — `device:` 过滤与自动补全

**What to build:** 过滤表达式新增 `device:`，语义与 `client:` 完全相同；`client:` 与已保存的过滤条件继续可用。输入 `device:` 时自动补全已知设备的名称和 IP。过滤表达式在前端解析，不涉及后端。这是设备栏移除之前先保证的替代手段。

**Spec:** ../spec.md

**Blocked by:** 01 — 前置修复：把 mitmproxy 钉到精确版本

**Status:** ready-for-agent

- [ ] `device:<名称或 IP>` 与 `client:<名称或 IP>` 的结果一致
- [ ] 旧的 `client:` 过滤和已保存的过滤条件不受影响
- [ ] 输入 `device:` 时出现已知设备的补全项
- [ ] 前端测试覆盖等价性与补全
