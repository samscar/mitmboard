# 02 — API 与运行时回放、revision 冲突检测

**Spec:** ../spec.md
**Blocked by:** 01

**Status:** resolved (2026-11-09)

## What to build

1. **重构 `SSLProxy`**（`mitmboard/sslproxy.py`）：移除 `base` / `capture_base()` / 双层合并与去重；`apply()` 以文件里的 regex 列表直接 `options.update(ignore_hosts=...)`。`effective_exclude()` 死代码一并清理。
2. **GET 重读与回放**：`GET /api/ssl-proxying` 每次重读 `config.yaml`；与上次生效的 `ignore_hosts` 块比对，内容变化才回放运行时并广播 `sslproxying.update`。响应 `{enabled, exclude: [原始 regex...], revision}`；不另设 reload 端点。已建立的隧道不重判。
3. **写入端点**：接收「完整目标列表 + revision」；revision 不一致返回冲突（附服务端最新列表），一致则写盘 → 热更新 → 广播。写盘失败时不热更新、不广播成功态，返回错误。
4. **冲突语义**：以 `ignore_hosts` 块的规范化内容为基准；外部改动由前端给出「以文件为准重载 / 以我的列表覆盖」两个显式动作，服务端不得静默合并或静默覆盖。收到本应用广播的客户端只刷新本地 revision。
5. **CLI 优先级**：`addon.configure()` 不再捕获基线；启动时以文件内容覆盖 CLI `--ignore-hosts` / `--set` 注入值。
6. **enabled 语义**：关闭时运行时置 `^.*(:\d+)?$` 全匹配、不写 `config.yaml`；刷新后保持关闭；重新开启恢复文件名单。
7. **API 形状**：`SSLProxyingBody` 与 WS 事件去掉 `base` 字段，加入 `revision`；`types.ts` 由 03 票同步。

## Acceptance

- [ ] 外部改 `config.yaml` 后刷新：`GET` 返回最新条目且运行时 `ignore_hosts` 同步更新
- [ ] `GET` 内容未变化时不重复 `options.update`、不重复广播
- [ ] 写盘失败时运行时保持旧值，接口返回错误而非成功
- [ ] revision 冲突可被检测，服务端返回最新列表，无静默覆盖
- [ ] CLI `--ignore-hosts` 与文件不一致时以文件为准
- [ ] `enabled` 关闭后刷新仍关闭、文件不变；开启后恢复文件名单
- [ ] 代码与响应中无 `base` / `capture_base` 残留

## Comments

2026-11-09 实现：`sslproxy.py` 去掉 `base` / `capture_base()` / 双层合并与 `wildcard_to_anchored_regex`（转换移到前端）；`server.py` 的 GET 重读并回放、PUT 校验 revision、409 + `force`。**实现期偏离**：启动覆盖没有放在 `configure()` 钩子里（它会被自身的 `options.update` 触发并反向覆盖 UI 值），改为 `running()` 中的 `sync_from_config_yaml()`；详见 ADR 0014 的 Implementation notes。API 与 WS 载荷为 `{enabled, exclude, revision}`。
