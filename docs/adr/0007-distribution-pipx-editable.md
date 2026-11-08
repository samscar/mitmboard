# 分发：日常用 pipx，开发用 editable，界面产物在打包前复制进包

**Status**: accepted

## Context

用户按 README 执行 `.venv/bin/mitmboard` 之后，在新 shell 里敲 `mitmboard` 得到 `command not found`。原因是 `pip install -e .` 只把可执行文件写进 `.venv/bin/`，而该目录仅在激活了 venv 的 shell 里进入 `PATH`；用绝对路径启动服务，既不会改 `PATH`，还会占住当前终端。

进一步核查发现第二个坑：`pyproject.toml` 只把 `mitmboard/web_dist/**` 声明为 package data，而开发检出里前端产物在 `web/dist`，没有任何步骤把它复制过去。因此 `pip install .` / `pipx install .` 会构建出一个**没有界面**的包——只能启动代理，打不开 UI。

两个受众并存：日常使用（希望随处 `mitmboard` 可用）与开发本仓库（希望改代码立即生效）。

## Decision

- **日常使用用 pipx。** 每个应用一个独立 venv（`~/.local/pipx/venvs/mitmboard`），只在 `~/.local/bin` 放一个 shim。不写入系统 Python，不导出环境变量，卸载即净。
- **开发用 `pipx install --editable .`。** shim 指向本仓库：改 Python 代码下次启动即生效；改前端需先 `npm run build`，editable 布局会直接读 `web/dist`。
- **非 editable 安装前必须暂存界面**：`scripts/stage_web_assets.sh` 把 `web/dist` 复制到 `mitmboard/web_dist`，该目录加入 `.gitignore`。脚本先删后拷，避免旧产物混进新 wheel。
- 保留 `.venv/bin/mitmboard` 作为最轻量路径（只在本仓库用，不改全局）。

## Considered Options

- **把 `.venv/bin` 永久加进 `PATH`**：换目录或删 venv 就失效，且把一个仓库路径永久塞进 shell 配置，属于隐式耦合。
- **把 `web_dist` 提交进仓库**：二进制产物入库，每次前端改动都产生大 diff，且容易与源码不同步。
- **用 setuptools 自定义 build 命令自动跑 npm build**：构建包里塞 Node 工具链，pipx 环境下不可控；npm 构建仍应由人决定何时执行。

## Consequences

- UI 有改动时，打包顺序是 `npm run build` → `stage_web_assets.sh` → `pipx install .`；漏掉中间一步会得到旧界面或没有界面。
- editable 安装不会自动补新依赖：改 `pyproject.toml` 依赖后需 `pipx install --force --editable .`。
- pipx 安装需要网络拉依赖；离线机器仍走 venv 路径。
- `mitmboard --version` 同时打印 Mitmboard 与 mitmproxy 版本，便于判断命令指向的是哪一份安装。
