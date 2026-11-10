# SSL Proxying Settings：以 exclude 名单取代 passthrough 子系统

**Status**: accepted

> **2026-11-09 更正**：本 ADR 记录 V1 的功能引入。真相来源、条目形态、持久化与 CLI 优先级已由 [ADR 0014](./0014-ignore-hosts-as-source-of-truth.md) 重新裁定；下文 §3–§5 与 Post-acceptance notes 属历史决策，勿作为当前实现依据。

## Context

用户在测试中需要把一些关键 host 排除在 TLS 拦截之外，确保不被中间人解密干扰（证书校验、证书固定场景下 App 会拒绝连接）。这对应 Charles 的 **Proxy → SSL Proxying Settings** 对话框及其 Exclude 列表。

Mitmboard 现状是自创的 **passthrough 子系统**：当同一 host 在 60 秒窗口内拒绝代理证书 ≥2 次，`PassthroughRegistry` 自动把它翻转为「不解密、按密文原样转发」（`tls_clienthello` 钩子置 `ignore_connection`）；另有 `~/.mitmboard/config.json` 的 `passthrough_hosts` 预置名单（手改文件、重启生效）。该机制有三个问题：

1. **Charles 没有对应物**。Charles 用户遇到证书固定的 App，看到的是连接失败记录，靠手动把 host 加进 SSL Proxying 的 Exclude 列表解决——语义是「用户主动排除」，不是「系统被动降级」。两套名单并存回答两个不同的问题，心智模型复杂。
2. **覆盖层级浅**。passthrough 只在 TLS 握手层生效（仅匹配 SNI），管不了明文 CONNECT 与 HTTP 的 Host。mitmproxy 原生 `ignore_hosts` 在 proxyserver 层生效，语义更彻底，且 `--ignore-hosts` 已透传 CLI（`docs/cli-parity.md` 当初就把它映射到「SSL Proxying 的 include/exclude 列表」）。
3. **不可运行时编辑**。预置名单只能手改配置文件并重启。

## Decision

1. **删除 passthrough 子系统**：`PassthroughRegistry`、`mitmboard/passthrough.py`、addon 的 `tls_clienthello` / `tls_failed_client` 两个钩子、`/api/passthrough` 接口、工具栏「N encrypted」胶囊、PassthroughModal、StructureTree 的 passthrough 标记、相关 store/ws 状态与测试，全部移除。`passthrough_hosts` 配置字段废弃，**不做迁移**。
2. **新增 Proxy → SSL Proxying Settings… 对话框**（menuModel 现有 todo 占位转正）：
   - **Enable SSL Proxying 勾选框**，V1 即为功能开关：关 = `ignore_hosts` 置为全匹配（全部 TLS 连接按密文原样转发、不解密），开 = 正常拦截。语义与 Charles 一致，同时充当「一键全局不影响测试」的保险开关。
   - **Include tab** 按置灰占位呈现（ADR 0008「空槽位即承诺」），待将来接 `allow_hosts`。
   - **Exclude tab** 为 V1 唯一功能列表：增删改 host 通配符条目。
3. **条目语法**：Charles 风格通配符（`*` → `.*`，`?` → `.`，其余字符转义），转换成**完全锚定**的 regex（`^…$`）驱动 `ignore_hosts`；不带通配符的条目即精确匹配。锚定避免 `example.com` 误伤 `notexample.com` 这类 search 语义陷阱。
4. **条目只含 host、不带端口**——有意偏离 Charles（其条目形如 `*.example.com:443`）：`ignore_hosts` 仅匹配 host，端口字段会误导用户以为端口参与匹配。
5. **生效与持久化**：UI 保存即经 API 热更新 addon 并广播；与 `web_port` 等设置同策略，**UI 保存覆盖 CLI `--ignore-hosts`**。持久化到 `~/.mitmboard/config.json` 的 `ssl_proxying` key（`{"enabled": bool, "exclude": [...]}`），沿用 `breakpoints` / `map_local` 的读改写模式。
   - **2026-11-09 更正**：此句与下方 Post-acceptance notes 的语义修订相矛盾；出货实现为「基线合并、基线不被覆盖」。两者现均由 ADR 0014 取代。
6. **直通流量不可见**：被 exclude 的连接在 proxyserver 层直接放行、不产生 flow，flow 列表看不到任何记录，**名单是唯一真相来源**——有意偏离 Charles（被排除 SSL 代理的 host 仍以 `<encrypted>` 记录出现）。

## Considered Options

- **保留 auto-flip、两套并存**：passthrough 管「谁拒收我们的证书」，exclude 管「用户禁止碰谁」。解释成本最低，但两个透传机制叠加，且 Charles 无此功能，与产品「镜像 Charles」的既定哲学相悖。
- **复用 passthrough 名单扩展 UI**：名单只有一套，但自动翻转条目与手动条目混排，且 `ignore_hosts` 的 proxyserver 层能力用不上。
- **Recording Settings 的 exclude**：Charles 的 Recording Settings 也有 Exclude 页，但语义是「照常拦截、只是不记录」——证书替换仍然发生，无法满足「不影响测试」的诉求，排除。

## Consequences

- 证书固定的 App 将直接断连，用户需从 flow 列表的失败记录定位后手动加 exclude；发现性从「自动降级」退化为「看失败记录」。这是与 Charles 行为对齐的代价。
- cli-parity.md 的 `--ignore-hosts` 行需更新映射目标为「SSL Proxying Settings → Exclude」。
- Include tab 实现时接 `--allow-hosts`，届时需定义 include/exclude 的优先级（Charles：exclude 优先于 include）。
- 对话框类型加入 `uiStore` 的 `UiDialog` 联合类型，可从菜单、工具栏、状态栏多处打开（ADR 0008 的既有约束）。

## Post-acceptance notes（2026-11-08 实现时）

- mitmproxy 的 `ignore_hosts` 以 `re.search` + 自带 `re.IGNORECASE` 匹配 **`host:port`** 串（`mitmproxy/addons/next_layer.py`），故通配符转换的锚定形式为 `^host(:\d+)?$`——纯 `^host$` 永远匹配不到任何真实候选。
- 热更新零成本：`NextLayer.configure` 在 option 变更时重编译 matcher，UI 保存只需更新 option。
- **语义修订（用户确认）**：`ignore_hosts` 是双层结构——启动时从 `~/.mitmproxy/config.yaml` / CLI `--ignore-hosts` 原样捕获一份**基线**（本机已有 6 条手工规则：Apple 服务、loopback、内网 IP 等，捕获发生在 addon configure 时，此时 config.yaml 已由 mitmproxy 合并完毕）；UI 名单（config.json 的 `ssl_proxying.exclude`）是其增量维护层。UI 保存时 option = 基线 ∪ 转换后的 UI 条目（去重），新增即同步进全局 ignore_hosts，删除只删 UI 条目，基线永远不被覆盖——UI 是全局名单的维护面，基线仍在各自文件中管理。Enable SSL Proxying 关闭时基线也一并失效（全部 TLS 连接按密文原样转发）。API 响应携带 `base` 字段，UI 以只读段落展示。
  - **2026-11-09 更正**：此处的双层结构与只读段落已由 ADR 0014 废除；另「本机 6 条手工规则」与当前 `~/.mitmproxy/config.yaml` 的 5 条不符，属当时现场记录，不是配置事实。
