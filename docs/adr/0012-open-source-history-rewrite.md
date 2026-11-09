# 为开源发布重写 Git 历史，永久脱离上游

**Status**: accepted

发布到 `github.com/samscar/mitmboard` 前，把 `f472c89` 及其之前的 59 个上游提交压成一个无父的 import commit（树与该提交逐字节相同），自有 17 个提交线性重放于其后，再加 1 个开源化收尾提交。上游来源由 import commit 消息、`LICENSE` 与 `NOTICE` 记录，不再依赖提交对象。

## Considered Options

- **保留完整上游历史**：仍可 `git merge upstream/main`，但公开仓库会携带他人 59 个提交及内部作者邮箱等元数据。
- **`git replace` / graft**：只在本机生效，push 后其他人仍看到旧历史，等于没有压缩。
- **保留 merge 提交与 GitLab 占位提交**：`b99ddef` 经核对为零内容变化的 merge，其侧父 `a07cd6d` 只是仓库初始化 README，保留无价值且会引入第二根。

## Consequences

- **不可逆**：与 `anthibo/proxino` 的提交链彻底断开，今后无法 `git merge upstream/main`，只能按文件手工移植上游变更。ADR 0001 的「不再期待上游修复」由此升级为「无法再 merge 上游」。
- 19 个提交的作者与提交者统一为 `samscar <samscar@users.noreply.github.com>`；import commit 的 provenance 只写在消息里。
- 打包链路不再引用内网 npm 镜像：`web/package-lock.json` 的 prismjs 两个 tarball 改回 `registry.npmjs.org`，`npm ci` 可在任意公网环境执行。
- 历史中不含内部主机名、内部 npm 镜像或内部邮箱；MIT 归因链接仍指向上游，产品自身链接指向 `samscar/mitmboard`。

## 发布后清单（在当前工作仓库执行，不影响公开仓库结果）

1. `git tag -d v0.1.0 v0.1.1 v0.1.2 v0.1.3 v0.2.0` —— 上游版本标记，压缩后无对应节点。
2. `git remote remove upstream` 与 `git branch -D upstream-base` —— 移除 fork 基座引用。
3. `git push git@github.com:samscar/mitmboard.git oss-release:main` —— 目标为空仓库，普通推送即可，**勿加 `--tags`**，否则会把上述上游提交一并带过去。
4. 在 PyPI 配置 trusted publisher：`samscar/mitmboard` / `release.yml` / `pypi`；`release.yml` 由 tag `v*` 触发。
5. `docs/agents/issue-tracker.md` 中关于远程的说明按新仓库实际配置更新。
