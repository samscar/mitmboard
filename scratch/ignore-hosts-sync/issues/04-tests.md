# 04 — 测试：后端、前端与端到端

**Spec:** ../spec.md
**Blocked by:** 01, 02, 03

**Status:** resolved (2026-11-09)

## What to build

1. **后端（`tests/`）**：
   - `config.yaml` round-trip：注释头、其它键、顺序、引号风格保全；缺失建块；非 list / 非法 YAML / 非法 regex 拒绝写入。
   - 原子替换与首次备份；写盘失败不留下半成品、不热更新。
   - `GET` 重读回放：内容变化才 `options.update`、不变时不重复；CLI 注入值被文件覆盖。
   - revision 冲突检测与两个显式动作；`enabled` 关闭时全匹配、不写文件、刷新保持关闭。
   - 旧 `config.json` 的 `exclude` 删除且 `enabled` 保留；`base` / `capture_base` 无残留。
   - 转换函数：`10.53.*.*` → `^10\.53\..*\..*(:\d+)?$`；`example.com` 不误伤 `notexample.com`；`:443` 开关；严格 `^…$` 反例。
2. **前端（`web/tests/`）**：新增 `SSLProxyingModal` 组件测试（V1 缺失）——完整显示不截断、Add / 行内编辑 / 删除、内联预览、转换面板、同步状态、冲突提示、WS 广播刷新 revision。
3. **E2E（`web/e2e/`）**：UI 改一条 → 校验 `config.yaml` 内容与运行时生效；外部改文件 → 刷新页面后界面生效。这是 V1 完全没有的覆盖。
4. **回归**：`pytest`、`tsc`、前端单测、E2E 全绿；`grep -iE 'passthrough|capture_base|ssl_proxying.exclude'` 复核生产代码零残留（历史文档与已 resolved ticket 除外）。
5. **清理**：`web/tests/MapLocalRules.test.tsx:48` 与 `NodeSummary.test.tsx:30` 里已删除 `/api/passthrough` 的 mock 残留。

## Acceptance

- [ ] 后端测试覆盖成功与全部失败路径，原子写与备份有断言
- [ ] 前端有 `SSLProxyingModal` 组件测试，含长文本不截断的断言
- [ ] E2E 覆盖「UI → 文件」与「外部改文件 → 刷新生效」两个方向
- [ ] 四套测试全绿，且无生产代码残留引用

## Comments

2026-11-09 回归结果：后端 `pytest` **215 passed / 1 skipped**；前端 `tsc -b` 无错误、`vitest run` **36 文件 / 212 项全绿**；Playwright E2E **6 passed**；`npm run build` 成功。新增 `tests/test_ignorehosts.py`、`tests/test_sslproxy.py`（重写）、`web/tests/sslProxying.test.ts`、`web/tests/SSLProxyingModal.test.tsx`、`web/e2e/ssl-proxying.spec.ts`，并更新 server / addon / clients 相关测试与 5 处旧 `/api/passthrough` mock。

E2E 覆盖：「10.53.*.* → 规范 regex 写盘」「长 regex 不被截断」「外部改文件后刷新生效」三条；`mock-server.mjs` 增加有状态的 `/api/ssl-proxying` 与测试专用的 `__ssl-reset` / `__ssl-external`。同时修正 `smoke.spec.ts` 三条既有失败：默认视图是 Structure，而用例按 Sequence 的行结构断言，已在用例内先切到 Sequence。

环境注记：本机沙箱会拦截 pytest 已存在的 `tmp_path` 基目录 `mkdir(exist_ok=True)` 并返回 EEXIST，需用全新 `--basetemp` 运行；这与代码无关。Playwright Chromium 首次安装时，结尾清理 `__dirlock` 被安全删除策略拒绝，但浏览器本体已下载可用。
