# 排除：以 config.yaml 的 ignore_hosts 为唯一真相来源（V2）

**ADR:** ../../docs/adr/0014-ignore-hosts-as-source-of-truth.md
**Supersedes:** ../ssl-proxying-exclude/spec.md（V1，历史规格）
**Status:** 设计已收敛（2026-11-09 grilling 确认），实现另起一轮

## 目标

用户把 `ignore_hosts` 手工维护在 `~/.mitmproxy/config.yaml` 中。本轮把这份文件定为排除的唯一真相来源：UI 的增删改即时写回该文件；外部编辑该文件后刷新网页，界面与运行时代理都以最新内容为准，无需重启 mitmproxy。同时修掉可编辑行被 CSS 裁成 `1…`、IP 不可见的问题，并提供「通配符速记 → 原始 regex」的转换入口。

## 已定决策（grilling 结论，实现不得偏离）

| # | 决策 |
| --- | --- |
| D1 | `~/.mitmproxy/config.yaml` 的 `ignore_hosts` 是唯一真相来源；UI 只是编辑视图。删除 V1 的「基线」与「UI 名单」两层结构、删除只读区 |
| D2 | 条目形态 = 单条原始 regex；按目标 `host:port` 匹配，与设备来源 IP 无关 |
| D3 | 通配符速记（如 `10.53.*.*`）只作为输入辅助，落盘前展开为规范 regex；不落盘为通配符，反向转换不存在 |
| D4 | 规范样式沿用 `wildcard_to_anchored_regex`：`^…(:\d+)?$`，如 `^10\.53\..*\..*(:\d+)?$`；可选「仅 HTTPS :443」开关输出 `^…:443$`。严格 `^…$` 明确排除（mitmproxy 用 `re.search` 匹配 `host:port`，会完全不命中） |
| D5 | 逐操作即时写：每次 Add / Update / Delete / 勾选即原子写 `config.yaml` 并热更新；无 Save/Cancel，只有 Close 与「已同步 / 未同步」状态 |
| D6 | 每次 `GET /api/ssl-proxying` 重读文件；`ignore_hosts` 内容变化才 `options.update` + WS 广播；不另设 reload 端点 |
| D7 | CLI `--ignore-hosts` / `--set` 注入值被文件内容覆盖；启动时同样以文件为准 |
| D8 | 写文件用 `ruamel.yaml` round-trip 原地更新，保留注释、顺序与其它键；`pyproject.toml` 显式声明该依赖。不用 `optmanager.save()` |
| D9 | 首次写入前生成 `~/.mitmproxy/config.yaml.bak`（不覆盖已有备份）；写盘沿用 `mkstemp` + `os.replace` 原子替换 |
| D10 | 写盘失败 / YAML 损坏 / 非法 regex：拒绝写入且不热更新，界面显示错误与「未同步」 |
| D11 | 冲突基准 = `ignore_hosts` 块的规范化内容（不是整文件哈希、不是 mtime）；外部改动触发「以文件为准重载 / 以我的列表覆盖」两个显式动作 |
| D12 | 收到本应用的 `sslproxying.update` 广播只刷新本地基准哈希，不误报冲突 |
| D13 | `enabled` 仍存 `~/.mitmboard/config.json` 的 `ssl_proxying.enabled`；关闭时运行时置 `^.*(:\d+)?$` 全匹配、不改 `config.yaml`，刷新后保持关闭 |
| D14 | 删除 `config.json` 中 `ssl_proxying.exclude` 键，不迁移、不兼容；用户现有的 `10.53.*.*` 丢失，由用户更新后自行重新添加 |
| D15 | 界面参考 Charles 的**交互模式**而非数据形态：单一可编辑列表、完整等宽显示不截断、Add 插入可编辑行、行内编辑（Edit 或双击）、删除控件；不引入 Host / Port 两列 |
| D16 | 转换入口 = Add 框内联实时预览 + 对话框内独立「转换为 Regex」面板（批量、复制、一键加入、试匹配、`re.compile` 校验）；不新增顶级菜单，不自动改写文件中已有的手写 regex |
| D17 | Include tab 仍按 ADR 0008 / 0010 置灰占位，不因「参考 Charles」而实现 |
| D18 | 条目定位按内容匹配，不用数组下标（外部改动后索引会漂移）；WS 广播载荷 = 文件最新内容 + `enabled` |
| D19 | `config.yaml` 缺失则创建 `ignore_hosts` 块；结构异常（非 list / 非法 YAML）按 D10 处理，不猜测、不修复用户文件 |

## 后端设计

- 新增 `config.yaml` 读写层（建议 `mitmboard/ignorehosts.py`）：`ruamel.yaml.YAML(typ="rt")` 读改写 `ignore_hosts`；保持注释与其它键；原子替换；首次备份；校验每条为字符串且 `re.compile` 通过。
- `SSLProxy` 移除 `base` / `capture_base()` / 双层合并；`apply()` 直接以文件内容的 regex 列表调用 `options.update(ignore_hosts=...)`；`enabled=false` 时置全匹配但不写文件。
- `GET /api/ssl-proxying` 重读文件 → 与上次生效内容比对 → 变化则回放运行时并广播；响应 `{enabled, exclude: [原始 regex...], revision}`（`revision` 为 `ignore_hosts` 块规范化内容的哈希，供 D11/D12 使用）。
- 写入端点接收「完整目标列表 + revision」；服务端比对 revision，不一致返回冲突（携带服务端最新列表），由前端给出两个显式动作；一致则写盘 + 热更新 + 广播。
- 启动时 `configure()` 不再捕获基线，直接以文件内容覆盖 CLI / `--set` 注入值。
- `ClientRegistry` 删除 `ssl_proxying.exclude` 的读写；只保留 `enabled`（缺省 True）。

## 前端设计

- 删除 `.sslproxy-base` 只读区与 `types.ts` 的 `base` 字段；单一列表渲染文件里的全部 regex，等宽字体、自动换行、不截断，每行 Edit / Delete。
- 修掉 `theme.css:811` 的相邻兄弟选择器缺陷：给排除行专用类名，不复用 `.bp-row` 的 6 列 grid。
- Add 框接受通配符速记或原始 regex；输入时实时展示展开后的规范 regex，确认后以该 regex 落盘。
- 「转换为 Regex」面板：批量粘贴、逐条输出、复制、一键加入、试匹配输入框（输入 `host:port` 看是否命中）、`re.compile` 校验；「仅 :443」开关。
- 取消 Save/Cancel，只留 Close；顶部显示同步状态与错误；冲突时显示「以文件为准重载 / 以我的列表覆盖」。
- 收到 WS 广播后用服务端 revision 刷新本地基准；`dirty` 保护策略按 D5（无草稿态）移除。

## 验收

1. UI 新增一条排除（含输入 `10.53.*.*` 后转换），`config.yaml` 立即出现对应原始 regex，且注释头、其它键、顺序与引号风格保持。
2. 新连接立即按新名单放行，无需重启；已建立的隧道保持原决定。
3. 外部手工改 `config.yaml` 后刷新网页：界面显示最新条目，运行时 `ignore_hosts` 同步更新。
4. 外部改动与 UI 写入并发时，不静默覆盖；两个显式动作各自行为正确。
5. 写盘失败 / YAML 损坏 / 非法 regex 时：不写、不热更新、界面明确显示「未同步」与原因。
6. `enabled` 关闭后刷新仍保持关闭，且 `config.yaml` 内容不变；重新开启恢复文件名单。
7. 条目完整可见，长 regex 不再被裁成 `1…`；转换器输出与 `re.search(host:port)` 实际匹配一致，含「仅 :443」用例。
8. CLI `--ignore-hosts` 传入值与 `config.yaml` 不一致时，以文件为准。
9. 后端 `pytest`、前端 `tsc` + `vitest`、E2E 全绿；`docs/cli-parity.md` 与 README / architecture 与实现一致。

## Issue 列表

- `issues/01-backend-config-yaml.md` — 后端：`config.yaml` 读写层、备份、原子写、旧数据删除
- `issues/02-api-runtime-replay.md` — API 与运行时回放、revision 冲突检测、enabled 语义
- `issues/03-frontend-list-and-converter.md` — 前端：单一列表、Charles 式交互、转换面板、同步状态
- `issues/04-tests.md` — 后端 / 前端 / E2E 测试
- `issues/05-docs.md` — 文档与回归说明

## Comments

- 2026-11-09：设计经四轮 grilling 收敛并经用户确认。V1 的 `scratch/ssl-proxying-exclude/spec.md` 与 `issues/01`、`issues/04` 中「UI 覆盖 CLI」「6 条手工规则」等记载属历史记录，不作为依据。
- 本轮只落文档（ADR 0014、本 spec、5 张 issues、术语表、过期文档修正），不改实现代码。
