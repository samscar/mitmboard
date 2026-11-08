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
| T1 | `--web-host` | 已支持，默认 `127.0.0.1`；绑定非 loopback 时启动日志警告「UI 无鉴权」 | Proxy → Web Interface Settings：只有「启用」与「访问控制」，没有绑定地址项 | 完成 |
| T2 | `--web-open-browser` / `--no-web-open-browser` | 已支持；环境变量 `MITMBOARD_NO_BROWSER` 作为默认值，命令行参数优先 | **无对应**：Charles 是 GUI 应用，网页界面不自动打开浏览器 | 完成 |
| T3 | `--set web_password` | 不支持，UI 无鉴权（该 `--set` 目前同样被静默忽略） | Proxy → Web Interface Settings：可匿名，也可配置用户名与密码 | 已映射，本轮明确不做（单人使用）；若将来开放非 loopback 绑定，应重新评估 |
| T5 | `--set web_port=`、`--set web_host=`、`--set web_open_browser=` | 已实现：addon 注册同名选项，`--set` 原生生效，并与专用参数按优先级合并 | Proxy → Web Interface Settings（端口 / 访问控制） | 完成 |
| T4 | `--version`、`--help` | 已实现：`--version` 输出 `Mitmboard 0.2.0` 与 `Mitmproxy 12.3.1`；`--help` 列出 web 参数并指向 `--options` | Charles：About Charles（GUI，无 CLI） | 完成 |
| — | `--set web_debug`、`--set web_columns` | 不适用 | **无对应**：这是 mitmweb 自身 UI 的调试与列配置 | 不做，记录在案 |

## 已定的取舍

- `--proxy-port` 已删除（与 mitmweb 只留一套名字）。旧脚本改用 `-p`，误用时 CLI 直接报错并给出迁移提示。
- 无密码前提下 `--web-host` 允许绑定任意地址，绑非 loopback 时启动日志警告：UI 无鉴权，能访问到的人可以改规则。
- 优先级：专用参数 > `--set` > 环境变量 > 默认值。专用参数与 `--set` 冲突时以专用参数为准，并打印一行提示。
- `--set web_password` 仍不支持（单人使用，见 ADR 0005 之后的范围收敛），保留在 T3。

## 复现方式

```bash
.venv/bin/mitmboard --help            # 列出 web 参数，并指向 --options
.venv/bin/mitmboard --version         # Mitmboard 0.2.0 / Mitmproxy 12.3.1
.venv/bin/mitmboard --proxy-port 9090 # 报错：改用 -p/--listen-port
.venv/bin/mitmboard -p 9090 --set web_port=9091   # 代理 9090，UI 9091
```
