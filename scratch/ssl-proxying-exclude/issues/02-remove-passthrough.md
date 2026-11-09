# 02 — 移除 passthrough 子系统（后端 + 前端）

**Spec:** ../spec.md
**Blocked by:** None（与 01/03 无代码依赖，可并行；若先做 03，注意保留其需要的 store 骨架）

**Status:** resolved (2026-11-08)

## What to remove

依据 ADR 0010，passthrough 整体下线。删除清单（以 `grep -rn passthrough` 复核后为准，勿凭本清单盲删）：

**后端**
- `mitmboard/passthrough.py`（`PassthroughRegistry`）整文件
- `mitmboard/addon.py`：`tls_clienthello`、`tls_failed_client` 两个钩子及 `self.passthrough` 的构造与引用
- `mitmboard/server.py`：`GET /api/passthrough`、`DELETE /api/passthrough/{host}`、构造处的 `passthrough=None` 注入
- `mitmboard/clients.py`：`passthrough_patterns()`、`self._passthrough_patterns` 与 `data.get("passthrough_hosts", ...)` 读取
- 相关测试文件/用例

**前端**
- `web/src/components/PassthroughModal.tsx` 整文件，及 `Dialogs.tsx` 中的注册
- `web/src/components/TopBar.tsx`：`passthroughActiveCount` 与「N encrypted」胶囊（含 `tb-passthrough` 样式钩子）
- `web/src/components/StructureTree.tsx`：passthrough 过滤/标记逻辑
- `web/src/components/LockOpenIcon.tsx`（仅 passthrough 两处使用的图标）
- `web/src/store.ts` / `web/src/ws.ts` / `web/src/api.ts`：passthrough 状态、`passthrough.update` 处理、`fetchPassthrough` / `removePassthrough`
- `web/src/uiStore.ts`：`UiDialog` 中的 `"passthrough"` 值
- 相关 CSS（`theme.css` 中 `tb-passthrough` 等）

**配置**
- `~/.mitmboard/config.json` 的 `passthrough_hosts` 字段**废弃，不做迁移**（用户已确认）；代码层面不再读取该 key 即可，无需主动删除用户文件里的残留。

## 注意

- `tls_failed_client` 的失败记录目前还兼作日志信号，删除后证书固定的 App 表现为连接失败——这是预期行为（ADR 0010 Consequences 第一条），不需要补偿逻辑。
- 删除后全仓 `grep -i passthrough` 应只剩历史文档（ADR、scratch 旧票）与 config.json 用户数据。

## Acceptance

- [ ] 上述清单全部删除，`grep -i passthrough` 在 `mitmboard/`、`web/src/`、`tests/` 下零命中
- [ ] UI 无「N encrypted」胶囊、无 Passthrough 弹窗入口、StructureTree 无相关标记
- [ ] `pytest` 全绿；UI 手测无 JS 报错、无死引用

## Comments

passthrough.py、addon 两钩子、/api/passthrough、TopBar 胶囊、PassthroughModal、StructureTree encrypted 占位（含 `Folder.encrypted` 字段与 LockOpenIcon）、store/ws/api/uiStore 状态、`passthrough_hosts` 读取、相关测试全部移除。`tests/test_cli.py` 的 `test_passthrough_keeps_user_mitmdump_args` 更名为 `test_keeps_user_mitmdump_args`（历史上就是测 CLI 透传，与 passthrough 无关）。源码目录 grep passthrough 零残留；`build/lib` 为陈旧产物、随下次打包重建。
