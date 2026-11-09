# 01 — 后端：ssl_proxying 配置、通配符转换、API 与 addon 热更新

**Spec:** ../spec.md
**Blocked by:** None

**Status:** resolved (2026-11-08)

## What to build

1. **配置读写**（`mitmboard/clients.py`）：新增 `ssl_proxying()` 与 `set_ssl_proxying(data)`，读写 `~/.mitmboard/config.json` 顶层 `ssl_proxying` key，结构 `{"enabled": bool, "exclude": [str, ...]}`。读改写与原子写入沿用 `set_breakpoints` 的模式（`_read_config` → 只覆盖本 key → `_write_config`）。校验：`exclude` 必须是字符串数组；enabled 缺省为 True；exclude 缺省为空数组。

2. **通配符→锚定 regex 转换**（新纯函数模块，建议 `mitmboard/sslproxy.py`）：
   - `*` → `.*`，`?` → `.`，其余正则元字符一律 `re.escape`；
   - 结果用 `^` / `$` 包裹（完全锚定，防 search 语义误伤）；
   - 不含通配符的条目即精确匹配（同样锚定）；
   - 输入大小写不敏感：转换时统一 lower，或 regex 加 `re.IGNORECASE`——票内定夺，但行为必须有测试钉住。
   - 非法输入（空串、纯空白）在配置边界抛 `ValueError`。

3. **API**（`mitmboard/server.py`）：`GET /api/ssl-proxying` 返回当前状态；`PUT /api/ssl-proxying` 保存并返回保存后的状态（响应模式同 breakpoints）。保存路径上同步更新 addon 内存状态，并通过 broadcaster 广播一条更新消息（消息类型自定，如 `sslproxying.update`）。

4. **addon 生效语义**（`mitmboard/addon.py`）：
   - addon 持有 enabled 标志与锚定 regex 列表；
   - 生效点用 `ignore_hosts` 语义：优先方案是直接更新 mitmproxy options（`ignore_hosts` 支持运行时变更）；若 options 路径与透传的 CLI 参数生命周期冲突（如 mitmdump 启动参数在 options 里已有值），可退而求其次在 addon 的 tls/http 钩子里自行判断并置 `ignore_connection`——但语义必须是 proxyserver 级的「host 匹配即整体放行」，与 D1 一致；
   - enabled=False 时等价于空名单；
   - **UI 覆盖 CLI**（D5）：UI 保存后覆盖启动时 `--ignore-hosts` 带入的值；覆盖行为写一行日志。

5. **测试**（`tests/`）：转换函数的锚定/转义/大小写用例（含 `example.com` 不匹配 `notexample.com`、`*.example.com` 匹配 `api.example.com`）；配置读写的缺省值与校验；API roundtrip；addon enabled 开关与热更新语义。

## Acceptance

- [ ] `GET/PUT /api/ssl-proxying` 可用，保存后 config.json 出现 `ssl_proxying` key
- [ ] 通配符转换完全锚定，测试覆盖误伤反例
- [ ] 保存后无需重启，新连接立即按名单放行
- [ ] UI 保存覆盖 CLI `--ignore-hosts`，且有日志
- [ ] `pytest` 全绿

## Comments

实现落点：`mitmboard/sslproxy.py`（转换 + SSLProxy 引擎）、`clients.py` 的 `ssl_proxying()/set_ssl_proxying()`、`server.py` GET/PUT `/api/ssl-proxying`、`addon.py` 的 `apply_ssl_proxying()` 与一次性 `configure()`。生效走 mitmproxy 原生 `ignore_hosts` option（`NextLayer.configure` 在 option 变更时重编译，热更新零成本）。关键实现事实：mitmproxy 用 `re.search` + `re.IGNORECASE` 匹配 **`host:port`** 串（`next_layer.py:222`），故锚定 regex 为 `^host(:\d+)?$`；测试以 `re.compile(rex, re.IGNORECASE)` 镜像其行为。测试：`tests/test_sslproxy.py` + clients/server/addon 各若干，新增 27 项。
