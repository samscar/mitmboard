# Issue tracker：本地 Markdown

本仓库的 issue 与 spec 以 markdown 文件形式存放在 `scratch/` 下。

## 约定

- 一个功能一个目录：`scratch/<feature-slug>/`
- spec 为 `scratch/<feature-slug>/spec.md`
- 实施类 issue 一票一文件，路径 `scratch/<feature-slug>/issues/<NN>-<slug>.md`，编号从 `01` 起 —— 不要写成单个合并的 tickets 文件
- triage 状态记录在每个 issue 文件靠上的 `Status:` 行（角色字符串见 `triage-labels.md`）
- 评论与讨论历史追加到文件末尾的 `## Comments` 标题下

## 当 skill 要求「发布到 issue tracker」

在 `scratch/<feature-slug>/` 下新建文件（目录不存在则创建）。

## 当 skill 要求「获取相关 ticket」

读取被引用路径的文件。用户通常会直接给出路径或 issue 编号。

## Wayfinding 操作

供 `/wayfinder` 使用。**map** 是一个文件，每个 ticket 对应一个子文件。

- **Map**：`scratch/<effort>/map.md` —— 承载 Notes / Decisions-so-far / Fog 正文。
- **子 ticket**：`scratch/<effort>/issues/NN-<slug>.md`，编号从 `01` 起，正文写问题本身。`Type:` 行记录类型（`research` / `prototype` / `grilling` / `task`）；`Status:` 行记录 `claimed` / `resolved`。
- **阻塞**：靠文件顶部写 `Blocked by: NN, NN`。当它列出的每个文件都是 `resolved` 时，该 ticket 解除阻塞。
- **前沿（frontier）**：扫描 `scratch/<effort>/issues/`，找出打开、未阻塞、未被认领的文件；编号最小者优先。
- **认领**：先把 `Status:` 置为 `claimed` 并保存，再开始工作。
- **解决**：在 `## Answer` 标题下追加答案，把 `Status:` 置为 `resolved`，然后把上下文指针（要点 + 链接）追加到 `map.md` 的 Decisions-so-far。

## 本仓库现状

项目发布在 `github.com/samscar/mitmboard`；fork 基座为 `github.com/anthibo/proxino`（MIT，归属见 `NOTICE`）。issue 仍以本地 markdown 维护，不向任何 git 远程提交 issue；本机也未安装 `gh` CLI。若改用 GitHub Issues，把本文件替换为对应版本即可。
