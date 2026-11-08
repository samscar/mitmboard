# 命令行与 mitmweb 对齐，只保留一套参数名

**Status**: accepted

## Context

Mitmboard 是 mitmproxy 内核上的另一个界面。用户已经在用 mitmweb，不希望为同一个内核记两套命令。核对后发现两种不一致：

- 我们自造了 `--proxy-port` 来设代理端口，mitmweb 用的是 `-p/--listen-port`。同一件事两个名字，同时给时还会静默忽略其中一个（见 `docs/cli-parity.md` 的核对记录）。
- mitmweb 的 web 参数我们只实现了端口。`--web-host`、`--no-web-open-browser` 直接透传给 mitmdump 会报 `unrecognized arguments`；`--set web_port=` 这类写法更糟——mitmdump 对未知 `--set` 键静默忽略，写了不生效也没有提示。

另一个前提：交付形态已收敛为纯 Web 应用（ADR 0005），所以「桌面壳用哪套参数」不再是约束，可以按 mitmweb 的形状一次性改干净。

## Decision

命令行只有一套参数名，就是 mitmweb 的：

- 删除 `--proxy-port`。代理端口用 `-p/--listen-port`。误用时 CLI 报错并给出迁移提示，而不是让 mitmdump 打 `unrecognized arguments`。
- 支持 `--web-port`、`--web-host`、`--web-open-browser` / `--no-web-open-browser`，默认值与 mitmweb 相同（8081 / 127.0.0.1 / 打开）。
- 在 addon 里注册 `web_port`、`web_host`、`web_open_browser` 三个与 mitmweb 同名的选项，于是 `--set web_port=9091` 原生生效。删除旧的 `mitmboard_web_port`。
- 优先级：专用参数 > `--set` > 环境变量 > 选项默认值。专用参数覆盖 `--set` 时打印一行提示，不静默。
- `--help` 与 `--version` 归 Mitmboard：help 只列 web 参数并指向 `--options`；version 打 `Mitmboard <版本>` 与 `Mitmproxy <版本>` 两行。
- 不做 `web_password`：单人使用，UI 无鉴权。`--web-host` 允许绑任意地址，但绑非 loopback 时启动日志必须警告。

## Considered Options

- **保留 `--proxy-port` 作为隐藏别名**：对旧脚本最友好，但代码里要长期养两套名字，且「谁赢」的规则本身就是学习成本。用户选择了删除并改脚本。
- **不注册 `web_*` 选项，只在 CLI 层解析**：`--set web_port=` 继续静默失效，而这正是最隐蔽的坑。
- **做 `web_password`**：与 mitmweb 更完整地对齐，但对单人使用是多余的门；将来若开放给他人访问，必须重新评估（T3）。

## Consequences

- 旧命令 `mitmboard --proxy-port 9090` 会失败并提示改用 `-p`；仓库内所有脚本（`desktop/sidecar/smoke.py`、`desktop/src-tauri/src/lib.rs`）已同步。
- 环境变量 `MITMBOARD_PROXY_PORT`、`MITMBOARD_WEB_PORT`、`MITMBOARD_NO_BROWSER` 降级为「默认值」，命令行可以覆盖它们。
- UI 绑定到局域网时没有登录。启动日志会明确说出这一点，责任留给用户；需要访问控制时再回到 T3。
- `docs/cli-parity.md` 是这份对齐的事实来源；参数再变化时先更新它。
