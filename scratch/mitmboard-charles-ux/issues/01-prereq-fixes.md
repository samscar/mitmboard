# 01 — 前置修复：把 mitmproxy 钉到精确版本

**What to build:** `pyproject.toml:23` 现在是 `mitmproxy>=12.3,<13`，仍然是范围约束。`addon.py` 大量读取 mitmproxy 的内部字段（`flow.metadata`、`tls_clienthello` 的 `data.context`、`is_replay` 等），小版本内的行为变化就足以让界面静默失效，因此把依赖钉到一个已验证可用的精确版本，并把这个版本写进 README 的运行环境说明。

**已经不成立的部分（原票 01 的第一项）**：`-s` 导致自身 addon 不加载的问题已由 commit `9d00811` 修复，`mitmboard/cli.py:36-40` 现在无条件追加 `-s <addon>`，只在用户已传同一路径时才跳过。本票不再包含该项，也不需要重做。

**Spec:** ../spec.md

**Blocked by:** None — can start immediately，并应在 02 合并前完成。

**Status:** ready-for-agent

- [ ] `pyproject.toml` 中 mitmproxy 依赖为 `==<已验证版本>`，不再含范围上界或下界
- [ ] 该版本号同时写进 README 的依赖/运行环境说明
- [ ] `pytest` 全绿，且能实际起一次界面确认没有用到该版本之外的能力
