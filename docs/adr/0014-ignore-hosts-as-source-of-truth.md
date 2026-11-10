# 排除以 config.yaml 的 ignore_hosts 为唯一真相来源

**Status**: accepted

## Context

ADR 0010 引入的 V1 把排除名单存放在 `~/.mitmboard/config.json` 的 `ssl_proxying.exclude`，并把 `~/.mitmproxy/config.yaml` / CLI `--ignore-hosts` 在启动时捕获为只读「基线」；UI 保存时把两者合并后热更新 `ctx.options.ignore_hosts`。用户实际把 `ignore_hosts` 当作日常维护对象手工写在 `config.yaml` 里，期望 UI 直接维护这份文件，且外部改文件后刷新网页即生效。V1 两点都做不到：UI 写的是另一个文件，而「基线」只在启动时捕获一次，外部改动必须重启代理。此外 `theme.css` 的相邻兄弟选择器 `.sslproxy-hint + .bp-rules .bp-row` 被插入的 `.sslproxy-base` 打断，可编辑行回退到 6 列 grid、被压进 18px 首列并 ellipsis 裁切，条目只剩 `1…`，用户配置的 IP 不可见。

## Decision

1. **唯一真相来源** = `~/.mitmproxy/config.yaml` 的 `ignore_hosts`。UI 是其编辑视图；删除「基线」与「UI 名单」两层结构，删除只读区。`config.json` 不再保存 `exclude`。
2. **条目形态** = 单条原始 regex（mitmproxy `ignore_hosts` 语义，按目标 `host:port` 匹配，与设备来源 IP 无关）。`10.53.*.*` 这类通配符速记只在输入时展开为规范 regex `^10\.53\..*\..*(:\d+)?$`，不落盘为通配符；反向转换不存在。
3. **写入时机** = 每次 Add / Update / Delete / 勾选即时原子写 `config.yaml`，同时 `options.update(ignore_hosts=...)` 热更新；取消 Save/Cancel，只留 Close 与「已同步 / 未同步」状态。
4. **文件写入** = `ruamel.yaml` round-trip 模式原地更新，保留注释、顺序与其它键；在 `pyproject.toml` 显式声明该依赖。不使用 mitmproxy 的 `optmanager.save()`（其 `parse()` 用 `typ="safe"` 丢注释，`serialize()` 会移除未知键）。首次写入前生成 `config.yaml.bak`，沿用 `mkstemp` + `os.replace` 原子替换。
5. **刷新生效** = 每次 `GET /api/ssl-proxying` 重读文件，`ignore_hosts` 内容变化才回放运行时并广播 `sslproxying.update`；CLI `--ignore-hosts` / `--set` 注入值被文件内容覆盖。已建立的隧道保留旧决定，不重判。
6. **写入安全与并发** = 写盘失败 / YAML 损坏 / 非法 regex 时拒绝写入且不热更新，界面显示错误与「未同步」；写前以 `ignore_hosts` 块的规范化内容比对，外部改动触发「以文件为准重载 / 以我的列表覆盖」两个显式动作；收到本应用的 WS 广播只刷新本地基准，不误报冲突。
7. **Enable SSL Proxying** 仍存 `config.json` 的 `ssl_proxying.enabled`；关闭时运行时置全匹配、不改 `config.yaml`，刷新后保持关闭。`config.yaml` 不存自定义键（mitmproxy 的 `load()` 走 `opts.update_defer(**data)`，未知键不可靠）。
8. **界面** = 参考 Charles 的交互模式而非数据形态：单一可编辑列表、完整等宽显示不截断、Add 插入可编辑行、行内编辑（Edit 或双击）、删除控件；不引入 Host / Port 两列（ADR 0010 §4 的有意偏离继续有效）。另设独立「转换为 Regex」面板：批量转换、复制、一键加入、试匹配、`re.compile` 校验；Add 框内联实时预览。Include tab 仍置灰占位（ADR 0008 / 0010）。
9. **旧数据不迁移** = 删除 `config.json` 中 `ssl_proxying.exclude` 键，保留 `enabled`；用户现有的 `10.53.*.*` 会丢失，由用户在功能更新后重新添加（用户明确接受单人使用、无兼容需求）。

## Considered Options

- **双真相**（`config.yaml` 存手写 regex、`config.json` 存 UI 通配符，运行时合并）：保留现状，但两套语法不可逆转换，且「刷新后外部改动生效」仍不成立。
- **`config.json` 为真相、保存时镜像写 `config.yaml`**：外部改动会在下一次 UI 保存时被覆盖，与第二个诉求冲突。
- **用 mitmproxy 自带 `optmanager.save()` 写文件**：已查明会丢注释并移除未知键，排除。
- **保留只读基线区、仅开放编辑**：刷新后「哪些条目属于该区」无稳定判据，且区标题所声称的 CLI 来源与「always in effect」均不再成立。
- **照抄 Charles 的 Host / Port 两列**：需推翻「原始 regex 为唯一形态」与 ADR 0010 §4，重新引入双表示，排除。
- **兼容并迁移旧 `exclude`**：用户明确放弃（单人使用，改后自行补充）；迁移增加幂等与失败路径，收益不成立。

## Consequences

- ADR 0010 保持 accepted（它记录功能引入），但其 §3（通配符为条目语法）、§4（端口字段）、§5（UI 覆盖 CLI）与 Post-acceptance notes 的语义修订均由本 ADR 取代；`scratch/ssl-proxying-exclude/spec.md` 为 V1 历史规格。
- `config.yaml` 成为唯一权威，任何外部编辑器 / 脚本改动都会在下次刷新生效；`config.json` 只剩开关状态。
- 逐操作写盘意味着 Cancel 不再有回滚语义；冲突检测因此是必需项，不是可选增强。条目定位须按内容匹配而非数组下标，否则外部改动后索引漂移。
- `docs/cli-parity.md` 中 `--ignore-hosts` 的映射需随实现更新；README 与 architecture.md 中已删除的 passthrough 描述同步修正。
- 实现另起一轮，见 `scratch/ignore-hosts-sync/spec.md`。

## Implementation notes（2026-11-09）

- 启动时覆盖 CLI 值**没有**放在 addon 的 `configure()` 钩子里：`options.update(ignore_hosts=...)` 本身会触发 `configure`，在那里读文件会把 UI 刚写入的值反向覆盖。改为 `running()` 中显式调用一次 `sync_from_config_yaml()`，之后的外部改动一律由 `GET /api/ssl-proxying` 回放。这是实现期发现的反馈环，测试 `tests/test_addon.py::test_sync_from_config_yaml_overrides_cli` 钉住了它。
- 转换逻辑由前端 `web/src/sslProxying.ts` 独有，后端只校验原始 regex 能否 `re.compile`；避免 JS 与 Python 两份实现漂移。浏览器试匹配会把 Python 专有的 `(?i)` / `(?i:` 归一化为等价的 JS 写法。
- ruamel 0.19.x 默认不保留引号样式，读写层显式设置 `preserve_quotes = True`，否则用户文件里的单引号会被静默改成裸标量。
