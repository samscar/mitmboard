# 03 — 前端：SSL Proxying Settings 菜单项与对话框

**Spec:** ../spec.md
**Blocked by:** 01（需要 `/api/ssl-proxying` 就绪）

**Status:** resolved (2026-11-08)

## What to build

1. **菜单**（`web/src/menuModel.ts:152`）：`todo("SSL Proxying Settings…")` 转 `cmd(..., openDialog("sslproxying"))`。**Proxy Settings… 保持 todo 不动**（那是端口等设置，另一张票）。
2. **对话框类型**（`web/src/uiStore.ts`）：`UiDialog` 增加 `"sslproxying"`；删除 `"passthrough"` 在 02 票完成。
3. **对话框组件**（新 `web/src/components/SSLProxyingModal.tsx`，并在 `Dialogs.tsx` 注册；视觉布局参照 `MapLocalModal` / `BreakpointsModal` 的既有模式）：
   - 顶部：**Enable SSL Proxying** 勾选框，文案与 Charles 原样（D8）：关 = 全部 TLS 连接按密文原样转发；
   - tab 条：**Include**（置灰占位，附 "Not implemented yet" 提示，D9）/ **Exclude**（激活）；
   - Exclude tab：条目列表 + Add / Edit / Delete；输入框接受 Charles 风格通配符；前端只做基本检查（空串、明显非法字符），最终合法性以服务端转换为准；
   - 保存语义与 `saveBreakpoints` 一致：`PUT /api/ssl-proxying` → 用响应更新 store → 关闭或即时反馈失败。
4. **状态接线**（`store.ts` / `api.ts`）：新增 ssl proxying 状态与 API 封装（`fetchSslProxying` / `saveSslProxying`）。

## 与 Charles 的有意偏离（组件内注释须标注）

- 条目只含 host 通配符、无端口字段（ADR 0010 Decision 4）；
- Include tab 置灰占位（D9）。

## Acceptance

- [ ] Proxy → SSL Proxying Settings… 打开对话框；Proxy Settings… 仍是置灰 todo
- [ ] Enable 勾选框关掉后，运行中的代理对全部新 TLS 连接直通；勾回恢复
- [ ] Exclude 增删改条目即时热生效（新连接），无需重启
- [ ] Include tab 置灰占位、Exclude tab 功能完整
- [ ] UI 无 TS 类型错误；手测流程通畅

## Comments

`menuModel.ts` SSL Proxying Settings… 转正（Proxy Settings… 仍为 todo）；新 `SSLProxyingModal.tsx`：Enable SSL Proxying 勾选框（功能开关）+ Include 置灰 tab + Exclude 列表（Add/Edit/Update/Cancel/Delete，Enter 提交）；`uiStore` UiDialog 增 `sslproxying` 删 `passthrough`；App resync 接 `fetchSslProxying` 与 `sslproxying.update` 广播。web 测试 34 文件 197 项全绿；`vite build` + `stage_web_assets.sh` 已刷新 `web/dist` 与 `mitmboard/web_dist`。
