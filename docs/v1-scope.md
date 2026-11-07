# v1 范围

v1 的验收标准是「我日常在 Charles 里的四个动作能跑通」，不是「与 Charles 功能表对齐」。任何不在下表中的 Charles 能力，一律进 backlog，不在 v1 讨论。

## 在范围内

| 功能 | 承载方 | 现状 | 验收 |
|---|---|---|---|
| SSL Proxying | mitmproxy 内核 | 已有（含 pinned host 自动直通） | 手机上的 App 显示明文响应 |
| 断点 | Mitmboard `breakpoints.py` | 已有 | 命中规则后暂停、改 header 或 body、放行生效 |
| Structure 视图 | 前端 + 既有 `/api/flows` | 已完成 | 按 host 与路径层级展开，能定位到具体接口 |
| Map Local | 新增 addon 钩子 + 前端 | 后端规则引擎已完成；命中标记、上传、前端待做 | URL 通配匹配后返回指定本地文件，请求不到达真实服务器 |

## 明确不在范围内

Map Remote、Rewrite、弱网模拟、Compose、DNS Spoofing、Mirror、Block List、
Block Cookies、Auto Save、Validate、按客户端进程归因、主题定制、国际化。

其中「按客户端进程归因」是能力缺失而非排期问题：mitmproxy 工作在代理层，拿不到客户端进程信息。

## 两处结构决策

**Structure 视图的位置**：左侧面板是可在 Structure / Sequence 之间切换的树（切换在面板顶部，过滤框在面板底部），右侧是详情。**设备栏已移除**（取代原先「左侧设备栏保留」的决定）：按设备筛选改用 `device:` 过滤并带自动补全，PASSTHROUGH 列表改为顶栏标签点开的弹窗，设备不再支持手动改名。

**Map Local 的边界**：只支持「URL 通配 → 单个本地文件」。不支持目录映射（mime 推断、相对路径、404 回退的复杂度不划算），不支持在 UI 内联编辑响应体。文件来源有两种：浏览器上传到托管目录 `~/.mitmboard/maplocal/`，或把已捕获的响应存成文件；托管文件以内容哈希命名，单文件上限 20 MB，保存规则时清理无引用文件。matcher 忽略 query，对话框需提示。新规则插到列表最前（先命中者胜），提供上移/下移。命中的流带标记：列表 `MAPPED` 徽标，详情 Notes 显示 "Mapped to local file: …"。

**规则存储**：复用 `~/.mitmboard/config.json` 现成的原子读改写机制，新增独立键，不另开文件。

## 界面交互原则

功能范围仍是上面四个动作；**交互风格以 Charles 5.2.2 为准**，不另创一套。验收清单：

1. 右键菜单（请求行、目录、host）：Map Local…、Focus、Copy URL、Copy cURL、Replay、Edit & Resend；已命中的请求显示「编辑 Map Local 规则…」「停用该规则」。断点、直通的位置预留。
2. Focus 为 Charles 式：被 Focus 的节点置顶，其余收进 Other Hosts；Sequence 视图用 Focused 开关。
3. 详情页：Overview / Contents / Summary / Chart / Notes。Contents 上下分屏（请求在上、响应在下），各有子标签。选中 host 或目录时显示节点汇总（Summary、Chart）。无 SSL 标签。
4. 键盘：↑↓ 切换选中并立即加载详情，←→ 折叠/展开，⌘/Ctrl+F 聚焦过滤框，Esc 先清 Focus 再清选中。
5. 顶栏精简为图标；Breakpoints 按钮移到状态栏右下；移除静态 Recording 文字。
6. 移除 Devices、Dashboard 顶层标签，只留 Inspector。

不在本批范围：手填断点的预填入口、断点命中提示、录制开关、Hex/JavaScript/Compressed 子标签。

## 动工前的两项前置修复

1. `mitmboard/cli.py` 中 `if not _has_option(rest, ("-s", "--scripts"))` 会导致：只要用户传入自己的 `-s` 脚本，Mitmboard 自身 addon 就不被加载，界面直接消失。
2. `pyproject.toml` 中 `mitmproxy>=11` 范围过宽，需钉到具体版本，避免 addon API 漂移。
