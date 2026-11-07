# 01 — 前置修复：`-s` 参数与 mitmproxy 版本

**What to build:** 用户启动时传入自己的 `-s` 脚本，Mitmboard 自身的 addon 仍然加载，界面不会消失；mitmproxy 依赖钉到具体版本，避免 addon API 漂移。这是 `docs/v1-scope.md` 要求的动工前修复。

**Spec:** ../spec.md

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 传入任意 `-s` 脚本启动后，Mitmboard 的界面和 API 仍可访问，且用户脚本也生效
- [ ] 依赖声明里 mitmproxy 不再是 `>=11` 的宽范围，而是钉到已验证可用的具体版本
- [ ] 有测试覆盖「带 `-s` 启动仍加载自身 addon」
