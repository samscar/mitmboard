# v1 范围

v1 的验收标准是「我日常在 Charles 里的四个动作能跑通」，不是「与 Charles 功能表对齐」。任何不在下表中的 Charles 能力，一律进 backlog，不在 v1 讨论。

## 在范围内

| 功能 | 承载方 | 现状 | 验收 |
|---|---|---|---|
| SSL Proxying | mitmproxy 内核 | 已有（含 pinned host 自动直通） | 手机上的 App 显示明文响应 |
| 断点 | Proxino `breakpoints.py` | 已有 | 命中规则后暂停、改 header 或 body、放行生效 |
| Structure 视图 | 前端 + 既有 `/api/flows` | 已完成 | 按 host 与路径层级展开，能定位到具体接口 |
| Map Local | 新增 addon 钩子 + 前端 | 后端已完成，前端待做 | URL 通配匹配后返回指定本地文件，请求不到达真实服务器 |

## 明确不在范围内

Map Remote、Rewrite、弱网模拟、Compose、DNS Spoofing、Mirror、Block List、
Block Cookies、Auto Save、Validate、按客户端进程归因、主题定制、国际化。

其中「按客户端进程归因」是能力缺失而非排期问题：mitmproxy 工作在代理层，拿不到客户端进程信息。

## 两处结构决策

**Structure 视图的位置**：中间面板由「平铺表格」变为可在 Structure / Sequence 之间切换的视图，左侧设备栏保留。不采用「左栏堆叠设备与域名树」的方案。

**Map Local 的边界**：只支持「URL 通配 → 单个本地文件」。不支持目录映射（mime 推断、相对路径、404 回退的复杂度不划算），不支持在 UI 内联编辑响应体。

**规则存储**：复用 `~/.proxino/config.json` 现成的原子读改写机制，新增独立键，不另开文件。

## 动工前的两项前置修复

1. `proxino/cli.py` 中 `if not _has_option(rest, ("-s", "--scripts"))` 会导致：只要用户传入自己的 `-s` 脚本，Proxino 自身 addon 就不被加载，界面直接消失。
2. `pyproject.toml` 中 `mitmproxy>=11` 范围过宽，需钉到具体版本，避免 addon API 漂移。
