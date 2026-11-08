# CLI 对齐清单：mitmweb ↔ Mitmboard

原则：**命令行与 mitmweb 对齐，界面交互与 Charles 对齐**。Charles 没有命令行，所以 CLI 的唯一参照物是 mitmweb；UI 的参照物是 Charles，两者不混用。

本文件记录 mitmweb 的每个命令行能力在 Mitmboard 中的状态，以及未实现项对应的 Charles 功能。状态以 `mitmweb 12.3.1` + 当前 `main` 实测为准。

## 已对齐（透传 mitmdump，行为一致）

| mitmweb 参数 | Mitmboard | Charles 对应 |
| --- | --- | --- |
| `-p/--listen-port`、`--listen-host` | 透传，可用；`-p` 存在时不再追加默认端口 | Proxy Settings → Port |
| `-m/--mode` | 透传，可用 | 无直接对应（Charles 只有 regular proxy） |
| `--set`、`-q`、`-v` | 透传，可用 | 各设置面板 |
| `-s/--scripts` | 透传；Mitmboard 自己的 addon 始终追加，用户脚本保留 | Tools → Map Local / Rewrite / Breakpoints（脚本是 mitmproxy 独有能力） |
| `-r/--rfile`、`-w/--save-stream-file` | 透传，可用 | File → Save / Export Session |
| `-f`（filter）、`--ignore-hosts`、`--allow-hosts` | 透传，可用 | Proxy Settings → Options / SSL Proxying 的 include 列表 |
| `--ssl-insecure`、`--upstream-cert`、`--no-server` | 透传，可用 | Proxy Settings → SSL |
| `--anticache`、`--anticomp`、`--showhost`、`--stickycookie`、`--stickyauth` | 透传，可用 | Tools → Rewrite / No Caching |
| `--options`、`--commands` | 透传，可用 | 无对应 |
| `--web-port` | 支持，默认同为 8081 | Proxy → Web Interface Settings → Port |

## 未对齐（待办）

| # | mitmweb 能力 | 现状 | Charles 对应 | 处置 |
| --- | --- | --- | --- | --- |
| T1 | `--web-host` | 硬编码绑定 `127.0.0.1`；传该参数会被透传给 mitmdump 并报 `unrecognized arguments` | Proxy → Web Interface Settings：只有「启用」与「访问控制」，没有绑定地址项；Charles 的网页界面走 `http://control.charles`，由代理转发 | 待实现（本轮已同意支持，安全策略见未决项） |
| T2 | `--web-open-browser` / `--no-web-open-browser` | 只能靠环境变量 `MITMBOARD_NO_BROWSER` 关闭 | **无对应**：Charles 是 GUI 应用，网页界面不自动打开浏览器 | 待实现（纯对齐 mitmweb，Charles 无此概念） |
| T3 | `--set web_password` | 不支持，UI 无鉴权（该 `--set` 目前同样被静默忽略） | Proxy → Web Interface Settings：可匿名，也可配置用户名与密码 | 已映射，本轮明确不做（单人使用）；若将来开放非 loopback 绑定，应重新评估 |
| T5 | `--set web_port=`、`--set web_host=`、`--set web_open_browser=` | 现状最差：mitmdump 对未知 `--set` 选项**静默接受并忽略**，所以这些写法写了也不生效，且没有任何提示 | Proxy → Web Interface Settings（端口 / 访问控制） | 待实现：在 addon 里注册同名选项，让 `--set` 原生生效 |
| T4 | `--version`、`--help` | `--version` 打印 `Mitmproxy: 12.3.1`，不显示 Mitmboard；`--help` 打印 mitmdump 参数表，Mitmboard 自己的参数出现 0 次 | Charles：About Charles（GUI，无 CLI） | 待实现：help 分两组，version 打印两行 |
| — | `--set web_debug`、`--set web_columns` | 不适用 | **无对应**：这是 mitmweb 自身 UI 的调试与列配置 | 不做，记录在案 |

## 未决

- `--proxy-port` 是 Mitmboard 自造参数（等价于 `-p`），mitmweb 没有。保留为隐藏别名、还是删除，待定。
- 无密码前提下 `--web-host` 是否允许绑定非 loopback 地址（等于匿名访问），待定。
- 参数优先级（专用参数 / `--set` / 环境变量 / 默认）与冲突提示措辞，待定。

## 复现方式

```bash
.venv/bin/mitmboard --help | grep -c "proxy-port\|web-port"   # 0：我们的参数不在 help 里
.venv/bin/mitmboard --version                                  # Mitmproxy: 12.3.1
.venv/bin/mitmdump --web-host 0.0.0.0                          # error: unrecognized arguments
```
