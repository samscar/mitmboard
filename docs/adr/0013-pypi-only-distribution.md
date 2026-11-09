# 分发只走 PyPI，不采用 Homebrew 与 npm

**Status**: accepted

本项目是 Python CLI，使用方主要在无图形界面的 Linux 云主机（术语表「场景 B」）通过浏览器访问 UI。决定只发布到 PyPI，使用方以 `pipx install mitmboard` 安装；不建 Homebrew tap，也不发 npm 包。

## Considered Options

- **PyPI（采纳）**：`pyproject.toml` 已声明 `[project.scripts]` 与 `web_dist` package data，`release.yml` 的 wheel 构建 + OIDC 发布 job 已就绪；实测 sdist 与 wheel 都包含完整前端产物。发布前无人工预审，pending publisher 可在首次 tag push 时自动创建项目。每次发版只需改版本号并打 tag，无需逐依赖维护。
- **Homebrew 自建 tap + Formula（否决）**：Homebrew 要求 Python 应用的所有递归依赖写成带 URL 与 SHA-256 的 `resource` 块，并由 `std_pip_args` 禁用 wheels 与自动依赖解析；`mitmproxy 12.3.1` 有 26 个直接依赖，完整锁定约 40–60+ 个包。目标云主机不预装 Homebrew，还需 `build-essential`、C 编译器、首次 sudo 预置 prefix，以及使用方对第三方 tap 的 `brew trust`。
- **npm（否决）**：npm 没有 Python 应用的原生分发格式，`bin` 要求 Node 入口；必须自写 postinstall / 平台包包装层，而包装层最终仍要安装 PyPI 上的 wheel，等于先做完 PyPI 再套一层壳。

## Consequences

- 对外使用方命令是 `pipx install mitmboard`（或 venv 内 `pip install mitmboard`）；`README` 的 From source 与 `pipx install .` 降级为开发路径，ADR 0007 据此补充。
- `README` Roadmap 里的 Homebrew tap 标记为不采用；不维护 Formula、tap 仓库、bottles 与 `resource` 锁。
- `release.yml` 保持不变：`v*` tag 触发 wheel + PyPI，`draft: true` 的 GitHub Release 不影响 PyPI，含 `-` 的预发布 tag 跳过 `pypi` job，`skip-existing: true` 防止重跑覆盖。
- 一次性前置由维护者在网页端完成：PyPI pending publisher（`samscar/mitmboard` / `release.yml` / `pypi`）与 GitHub `pypi` environment；账号需 2FA 与已验证邮箱。
- 放弃 brew 后，macOS / 本地开发者（场景 A）也改用 pipx。将来若 homebrew-core 的准入门槛达标，另提 PR 即可，与本决定不冲突。
