# 04 — 文档与全量回归

**Spec:** ../spec.md
**Blocked by:** 01, 02, 03

**Status:** resolved (2026-11-08)

## What to do

1. **`docs/cli-parity.md`**：`--ignore-hosts` 行的「Charles 对应」列更新为 `Proxy → SSL Proxying Settings → Exclude 列表`；`--allow-hosts` 行标注「Include 列表，UI 未实现（置灰占位）」；如需要，在「已定的取舍」补一条「UI 保存覆盖 CLI --ignore-hosts」。
2. **`README.md`**：如有设置/功能清单，补 SSL Proxying exclude 一句；删除 passthrough 相关描述（若有）。
3. **`CONTEXT.md` 术语表**（此票只核对，实际改动若尚未在别处完成则在本票落地）：
   - 删除「直通（passthrough）」条目及其 `<encrypted>` 文案约定；
   - 新增「排除（exclude）」条目：在 SSL Proxying Settings 中列出的 host 通配符名单，命中条目的连接不做 TLS 拦截、按密文原样转发、不出现在流列表；_Avoid_：忽略名单、白名单、bypass；
   - 新增「SSL 代理（SSL proxying）」条目：对 TLS 连接做中间人解密的行为；开关关闭时全部 TLS 连接按密文原样转发；
   - 「证书固定（pinned host）」条目保留，但其关联描述不再指向 passthrough。
4. **全量回归**：`pytest` 全绿；起一次真实代理，按 spec.md 验收清单 1–5 逐条手测；`grep -i passthrough` 复核零残留。

## Acceptance

- [ ] cli-parity.md、README、CONTEXT.md 与实现一致
- [ ] spec.md 验收清单逐条通过并记录结果
- [ ] `pytest` 全绿

## Comments

cli-parity.md 已更新；README 无 passthrough/SSL 相关清单，无需改动；CONTEXT.md 术语表已替换（直通→SSL 代理/排除）。pytest 195 passed + 1 skipped（原有 skip）。冒烟实测：起真实代理（18123/18124），GET 默认值 → PUT 保存 → 再 GET 一致，且日志出现 `SSL Proxying exclude list replaces the ignore_hosts values from the command line (6 pattern(s) -> 2)`，确认热更新与 UI 覆盖语义按 ADR 生效。

**⚠️ 验收中发现的新现实（grilling 时未暴露）**：本机 mitmproxy 配置里手工维护着 6 条 `ignore_hosts`（系统服务域名、loopback、局域网地址段、若干业务域名、公共搜索服务）——这是用户现役的排除机制。一旦在 UI 保存过排除名单，启动时 `configure()` 会用它**覆盖配置文件中的名单**。冒烟测试曾写入对应配置项，已移除恢复现场。待用户决策：接受「UI 接管」（迁移原有条目进 UI 排除名单）还是调整覆盖语义。

## Comments (2) — 语义修订：基线合并（2026-11-08）

用户裁定 D5 由「UI 覆盖」改为「**基线合并**」：启动时（addon configure，此时 mitmproxy 已合并 config.yaml）原样捕获 `ignore_hosts` 为基线（本机 6 条手工规则，Apple 服务等）；UI 名单为增量维护层，保存时 option = 基线 ∪ 转换后的 UI 条目（去重），UI 删除只删 UI 条目，基线永远不被覆盖；Enable SSL Proxying 关闭时基线一并失效。API 响应携带 `base` 字段，对话框以只读段落展示基线（标注"edit those files to change"）。实现：`SSLProxy.capture_base()`（一次性，防后续 configure 把合并值误当基线）+ `apply()` 合并去重；冒烟实测 GET 返回 6 条基线、PUT 后 option = 6 + 1、config.json 仅存 UI 条目。后端 pytest 199 passed；前端 tsc + vitest 34 文件全绿；bundle 已重建并 stage。冒烟写入 config.json 的测试条目已清除。

## Comments (3) — 2026-11-09 复核更正

- 上文引用的日志字符串 `SSL Proxying exclude list replaces the ignore_hosts values from the command line (6 pattern(s) -> 2)` 在仓库代码与运行环境中均不存在，属当时的误记。
- 「README 无 passthrough/SSL 相关清单，无需改动」与事实不符：README 与 `docs/architecture.md` 仍描述已删除的 `passthrough.py` / `passthrough_hosts` / `/api/passthrough`。已在 2026-11-09 文档批次中定点修正。
- 本票的验收结论仅对 V1 有效；真相来源反转见 [ADR 0014](../../../docs/adr/0014-ignore-hosts-as-source-of-truth.md) 与 `../../ignore-hosts-sync/spec.md`。