# 03 — Map Local 命中标记

**What to build:** 被 Map Local 命中的请求在 Structure 和 Sequence 两种视图的行里都显示 `MAPPED` 徽标；选中它时，详情里能看到命中的文件（本票先放在现有 Overview 中，ticket 10 再搬到 Notes）。后端在 flow 的元数据里记录命中的规则 id，列表和单条详情接口都返回它。

**Spec:** ../spec.md

**Blocked by:** 02 — 右键请求行建 Map Local（使用已捕获的响应）

**Status:** ready-for-agent

- [ ] 命中时 flow 元数据带上规则 id，未命中为空；`/api/flows` 与单条详情都返回
- [ ] 两种视图的行里都有 `MAPPED` 徽标
- [ ] 详情里显示「Mapped to local file: …」
- [ ] 后端测试通过 addon 驱动并经 API 读取；前端测试断言徽标与提示文字
