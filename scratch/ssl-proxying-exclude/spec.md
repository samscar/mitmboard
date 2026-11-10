# SSL Proxying Settings — Exclude 名单（V1）

**ADR:** ../../docs/adr/0010-ssl-proxying-exclude.md

> **2026-11-09**：本 spec 描述 V1 出货实现，已由 [ADR 0014](../../docs/adr/0014-ignore-hosts-as-source-of-truth.md) 与 [V2 spec](../ignore-hosts-sync/spec.md) 取代。D3 / D5 / D6 / D7 与验收 4 / 5 不再适用；下文两处与出货代码矛盾的表述已就地更正，其余内容保留作历史记录。

## 目标

用户在测试时能把关键 host 加入 exclude 名单，这些 host 的连接不做 TLS 拦截、按密文原样转发，从而不影响被测 App。入口镜像 Charles 的 **Proxy → SSL Proxying Settings…** 对话框。

## 已定决策（grilling 结论，实现不得偏离）

| # | 决策 |
| --- | --- |
| D1 | 语义 = mitmproxy 原生 `ignore_hosts`（proxyserver 层），非 TLS 握手层钩子 |
| D2 | passthrough 子系统彻底移除（auto-flip、UI、API、`passthrough_hosts` 字段废弃不迁移） |
| D3 | 条目语法 = Charles 风格通配符，转**完全锚定** regex（`*`→`.*`，`?`→`.`，其余转义，`^…$` 包裹） |
| D4 | 条目只含 host，不带端口（有意偏离 Charles，`ignore_hosts` 不匹配端口） |
| D5 | 运行时热更新；`ignore_hosts` 双层结构：启动时捕获 config.yaml / CLI 值为**基线**（原样生效、UI 只读展示），UI exclude 名单为其增量维护层，保存时 option = 基线 ∪ UI 条目（去重），UI 删除只删 UI 条目，基线不被覆盖 |
| D6 | 持久化到 `~/.mitmboard/config.json` 的 `ssl_proxying` = `{"enabled": bool, "exclude": [...]}` |
| D7 | 直通连接不产生 flow、UI 不可见，名单即唯一真相 |
| D8 | Enable SSL Proxying 勾选框 V1 即功能开关：关 = 全部 TLS 连接按密文原样转发（`ignore_hosts` 全匹配） |
| D9 | Include tab 置灰占位，暂不接 `allow_hosts` |
| D10 | 菜单入口 = Proxy → SSL Proxying Settings…（menuModel.ts:152 的 todo 转正），**不是** Proxy Settings |

## 后端设计

- `ClientRegistry`（`mitmboard/clients.py`）新增 `ssl_proxying()` / `set_ssl_proxying()`，沿用 `breakpoints` 的读改写与校验模式。
- 通配符→锚定 regex 的转换函数放独立模块（纯函数，单测友好）。
- API：`GET /api/ssl-proxying`、`PUT /api/ssl-proxying`（返回保存后的状态，模式同 `saveBreakpoints`）。
- addon 持有转换后的 regex 列表与 enabled 标志；保存时通过调用端更新 addon 内存状态并广播。ignore_hosts 的注入点用 addon 内自行判断（在 tls 与 http 层调用与 passthrough 相同形态的 `ignore_connection` 置位，或直接改写 mitmproxy options，实现票内定夺，但热更新与锚定语义不可变）。
- enabled=False 时：`ignore_hosts` 置为全匹配 `^.*(:\d+)?$`，全部 TLS 连接按密文原样转发（与 D8 一致）。*（2026-11-09 更正：原文「不排除任何 host、正常拦截一切」与 D8 及出货代码相反。）*
- enabled=True 且 exclude 为空：同样正常拦截一切。

## 前端设计

- `UiDialog` 加 `"sslproxying"`；菜单项 `SSL Proxying Settings…` 从 `todo` 转 `cmd`，打开对话框。
- 对话框：顶部 Enable SSL Proxying 勾选框（Charles 文案原样）；tab 条 Include（置灰）/ Exclude（激活）。
- Exclude tab：条目列表 + Add / Edit / Delete，输入框接受 Charles 通配符，保存前前端做基本合法性检查（非法字符、空串），最终以服务端转换为准。
- 删除 TopBar「N encrypted」胶囊、PassthroughModal、StructureTree passthrough 标记、`LockOpenIcon`、store/ws 的 passthrough 状态（与 02 票有交叠，以 02 票为准）。

## 验收

1. 在 exclude 里加 `*.example.com`，运行中的代理立即对新连接生效（无需重启），该 host 按「排除」名单原样转发、flow 列表无记录。
2. 带通配符条目转出的 regex 完全锚定；`example.com` 条目不匹配 `notexample.com`。
3. 取消勾选 Enable SSL Proxying，全部 TLS 连接按密文原样转发；重新勾选恢复。
4. 重启 mitmboard，名单与开关状态从 config.json 恢复。
5. CLI 传 `--ignore-hosts` 后在 UI 保存一次 exclude，基线原样保留，option = 基线 ∪ 转换后的 UI 条目（去重）；UI 删除只删 UI 条目。*（2026-11-09 更正：原文「必须是 UI 赢」与 D5 及出货代码相反。）*
6. `pytest` 全绿；`passthrough` 相关测试删除后无残留引用。

## Issue 列表

- `issues/01-backend-exclude.md` — 后端：配置读写、通配符转换、API、addon 热更新
- `issues/02-remove-passthrough.md` — 移除 passthrough 子系统（后端 + 前端）
- `issues/03-ssl-proxying-dialog.md` — 前端：菜单项、对话框、Exclude 列表
- `issues/04-docs-tests.md` — cli-parity.md 更新、README、全量回归

## Comments — 2026-11-09 文档更正

ADR 0014 把 `~/.mitmproxy/config.yaml` 的 `ignore_hosts` 定为唯一真相来源，V1 的 `config.json` 名单、只读基线区与双层合并语义全部废除。本 spec 及 `issues/01`、`issues/04` 中关于「UI 覆盖 CLI」「6 条手工规则」与日志字符串的记载属历史记录，不再作为依据。新规格见 `../ignore-hosts-sync/spec.md`。
