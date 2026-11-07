# 03 — Map Local 命中标记

**What to build:** 被 Map Local 命中的请求在 Structure 和 Sequence 两种视图的行里都显示 `MAPPED` 徽标；选中它时，详情里能看到命中的文件（本票先放在现有 Overview 中，ticket 10 再搬到 Notes）。后端在 flow 的元数据里记录命中的规则 id 与命中时的文件路径快照，列表和单条详情接口都返回它们。命中是这条流的一次性历史事实：规则之后被删除或停用，徽标与路径快照都不撤销。

**Spec:** ../spec.md

**Blocked by:** 02 — 右键请求行建 Map Local（使用已捕获的响应）

**Status:** ready-for-agent

- [x] 命中时 flow 元数据带上规则 id 与文件路径快照，未命中为空；`/api/flows` 与单条详情都返回
- [x] 规则被删除或停用后，已有命中的流仍保留徽标与快照路径
- [x] `MAPPED` 徽标在两种视图的行里都出现
- [x] 详情里显示「Mapped to local file: …」
- [x] 后端测试通过 addon 驱动并经 API 读取；前端测试断言徽标与提示文字
