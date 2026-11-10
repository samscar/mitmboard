# 05 — 文档与回归说明

**Spec:** ../spec.md
**Blocked by:** None

**Status:** resolved (2026-11-09)

## What to do

1. **ADR**：新增 `docs/adr/0014-ignore-hosts-as-source-of-truth.md`，记录真相来源反转与取舍；回填修正 ADR 0010 §5 与 Post-acceptance notes 的自相矛盾，0010 保持 accepted。
2. **术语表**：`CONTEXT.md` 的「排除」改为「mitmproxy `ignore_hosts` 配置中的一条原始 regex，按目标 host:port 匹配，与设备标识无关；该配置是唯一真相来源」；新增「通配符速记」；`_Avoid_` 加入「基线」。
3. **规格与票**：`scratch/ignore-hosts-sync/spec.md` 与本目录 5 张 issues。
4. **过期描述**：`docs/cli-parity.md` 补 ADR 0014 的待实现说明；README 与 `docs/architecture.md` 中已删除的 passthrough 描述改为现行的 SSL Proxying Exclude；`docs/v1-scope.md` 加范围说明；旧 `scratch/ssl-proxying-exclude/spec.md` 加取代横幅并更正两处与出货代码矛盾的表述；`issues/04` 追加复核更正。
5. **实现阶段**（留给下一轮）：实现落地后同步更新 `docs/cli-parity.md` 的 `--ignore-hosts` 映射、README 功能清单、architecture 的 API / WS 事件表，并把 ADR 0014 状态与实测结果回填。

## Acceptance

- [x] ADR 0014 落地，ADR 0010 矛盾处已标注且保持 accepted
- [x] `CONTEXT.md` 术语与 ADR 0014 一致
- [x] spec + 5 张 issues 符合一票一文件约定
- [x] 过期描述修正，历史 ADR 与已 resolved ticket 不被静默改写
- [x] 实现阶段文档同步（随 01–04 票完成后回填）

## Comments

2026-11-09 设计阶段已完成上述 1–4 项。ADR 编号由 0013 顺延为 **0014**（`0013-pypi-only-distribution.md` 已存在）。README 与 architecture.md 采用定点修正：把已删除的 passthrough 子系统描述改为 V1 出货的 SSL Proxying Exclude，并指向 ADR 0014 的待实现变更；未把尚未实现的行为写成现状。`docs/adr/0008` 与 V1 的 resolved issues 中的 passthrough 字样属历史记录，按约定保留。

**Comments (2) — 实现落地后回填（2026-11-09）**：`docs/cli-parity.md` 的 `--ignore-hosts` 行与取舍说明、`docs/architecture.md` 的排除章节 / API 表 / worked example 3、README 功能条目均已改为描述现行实现；ADR 0014 追加 Implementation notes（configure 反馈环、转换归属、ruamel 引号）。本票全部完成。
