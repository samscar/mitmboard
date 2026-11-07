Status: ready-for-agent

# Mitmboard 界面交互向 Charles 对齐，并补全 Map Local

术语以根目录 `CONTEXT.md` 为准：**Map Local**、**断点**、**直通**、**Structure 视图**、**Sequence 视图**、**Focus**、**设备**。范围与验收清单见 `docs/v1-scope.md` 的「界面交互原则」。

## Problem Statement

用户日常用 Charles 完成四个动作：SSL Proxying、断点、Structure 视图、Map Local。切换到 Mitmboard 后，同样的动作需要学另一套操作，比 Charles 麻烦得多：

- 没有右键菜单，也没有列表键盘操作。建规则必须先打开顶栏弹窗，再手填 host、path、method。Charles 是在请求上右键，规则已经预填好。
- Map Local 的后端已完成，前端是零行代码；用户只能手改 `config.json`。规则里的文件是服务端路径，而场景 B（云主机，浏览器访问）里文件在用户本机，后端又没有上传接口，没法用。
- Map Local 命中后，流上没有任何标记，用户分不清当前看到的是 mock 还是真实响应。
- 在 Structure 视图里点 host 只会折叠，想只看某个 host 得手敲过滤表达式；Charles 的 Focus 是一次右键。
- 详情页把请求和响应的 headers 合并成一个无标题的列表；Charles 的 Contents 是上下分屏，请求和响应各有一套子标签。
- 界面里有上游 Proxino 带来的 Devices、Dashboard 两个顶层页和一排静态状态文字，Charles 里没有对应物，增加了认知负担。

## Solution

功能范围不变（仍是 v1 的四个动作），交互风格全面对齐用户正在使用的 Charles 5.2.2：

- 布局改为「左边树、右边详情」。树面板顶部切换 Structure / Sequence，底部是过滤框；设备栏、Devices 页和 Dashboard 页移除。
- 在请求行、目录、host 上右键即可 Focus、建 Map Local 规则、复制 URL 或 cURL、重放、编辑后重发。
- Map Local 有完整的前端：规则列表弹窗、预填好的规则对话框、文件上传，以及「把这条已捕获的响应存成文件并映射」。命中的请求在列表里有 `MAPPED` 徽标，在详情的 Notes 里写明命中的文件。
- 详情页改为 Overview / Contents / Summary / Chart / Notes。Contents 上下分屏；选中 host 或目录时显示该节点的汇总。
- Focus 采用 Charles 的做法：被关注的节点置顶，其余收进 Other Hosts。
- 键盘可以完成切换选中、折叠展开、聚焦过滤框、清除 Focus 或选中。

## User Stories

1. 作为调试人员，我希望在一条请求上右键就能看到 Map Local、Focus、Copy URL、Copy cURL、Replay、Edit & Resend，这样我不用去顶栏找入口。
2. 作为调试人员，我希望在 Structure 视图的目录和 host 节点上也能右键，这样我能对一整个接口前缀建规则。
3. 作为调试人员，我希望右键 Map Local 时规则对话框已经预填好 host、path、method 和状态码，这样我只需选文件。
4. 作为调试人员，我希望在具体请求上预填的是精确的 host 和 path、以及该请求的 method，这样同一路径上的 GET 和 POST 不会被互相误伤。
5. 作为调试人员，我希望在目录上右键时预填的是 host 加 `该目录/*`，method 为 any，这样一条规则能覆盖整个前缀。
6. 作为调试人员，我希望在 host 上右键时只预填 host，这样我能 mock 整个主机。
7. 作为调试人员，我希望对话框明确提示「query 参数不参与匹配」，这样我不会以为 `?id=1` 和 `?id=2` 能被区分。
8. 作为调试人员，我希望可以选择「使用已捕获的响应」作为 mock 文件，这样我先抓到真实响应、马上就有一个可用的 mock。
9. 作为调试人员，我希望可以从浏览器上传 mock 文件，这样在云主机场景下也能用我本机的文件。
10. 作为调试人员，我希望「已捕获的响应」被存成文件时自动带上正确的扩展名，这样返回的 Content-Type 不会变成 octet-stream。
11. 作为调试人员，我希望上传超过 20 MB 的文件时得到明确的拒绝提示和替代做法，这样我知道该怎么办。
12. 作为调试人员，我希望重复上传同一个文件不会产生多份副本，这样托管目录不会膨胀。
13. 作为调试人员，我希望删除规则后，不再被任何规则引用的托管文件被清理，这样磁盘上不留垃圾。
14. 作为调试人员，我希望我手输的、位于托管目录之外的路径绝不会被清理，这样我自己的文件不会被误删。
15. 作为调试人员，我希望顶栏有一个 Map Local 入口，并用指示点显示它是否生效，这样我一眼知道当前是否在 mock。
16. 作为调试人员，我希望规则弹窗里有总开关，以及每条规则的启用勾选、编辑和删除，这样我能快速开关某条 mock。
17. 作为调试人员，我希望新建的规则出现在列表最前，这样更具体的规则不会被先前更宽的规则遮住。
18. 作为调试人员，我希望规则可以上移和下移，这样我能手动调整先命中者胜的顺序。
19. 作为调试人员，我希望被 Map Local 命中的请求在 Structure 和 Sequence 两种视图里都有 `MAPPED` 徽标，这样我分得清 mock 和真实响应。
20. 作为调试人员，我希望详情页的 Notes 显示「Mapped to local file: …」，这样我知道是哪条规则、哪个文件在生效。
21. 作为调试人员，我希望对已 MAPPED 的请求右键时看到「编辑 Map Local 规则…」和「停用该规则」，这样我直接定位到命中的规则，而不是再建一条重复的。
22. 作为调试人员，我希望映射的文件丢失时依然得到一个可见的 500，而不是悄悄放行到真实服务器，这样我不会误以为在用 mock 测试。
23. 作为调试人员，我希望在 host 上右键选 Focus，该 host 就被置顶，这样我能专注于一个后端。
24. 作为调试人员，我希望 Focus 之后其余 host 收进 Other Hosts 文件夹而不是消失，这样我随时能展开看全貌。
25. 作为调试人员，我希望在 Sequence 视图里有 Focused 开关，这样两种视图下的 Focus 行为一致。
26. 作为调试人员，我希望能取消 Focus，这样我可以回到完整视图。
27. 作为调试人员，我希望单击 Structure 里的 host 或目录是选中它，而不是折叠，这样操作习惯和 Charles 一致。
28. 作为调试人员，我希望用小三角或 ←→ 键折叠展开节点，这样我不用鼠标也能浏览树。
29. 作为调试人员，我希望用 ↑↓ 切换选中，并立即看到该请求的详情，这样我能快速浏览一串请求。
30. 作为调试人员，我希望快速连按 ↑↓ 时最终显示的是最后选中的那条请求，而不是前面某条慢响应的内容。
31. 作为调试人员，我希望 ⌘/Ctrl+F 聚焦过滤框，这样我不用鼠标就能搜索。
32. 作为调试人员，我希望 Esc 先清除 Focus、再清除选中，这样我能逐层退出。
33. 作为调试人员，我希望选中一条请求时，标题行显示 `METHOD URL → 状态码`，这样我一眼看清它是什么。
34. 作为调试人员，我希望 Contents 标签把请求放上、响应放下，这样我能同时对照两者。
35. 作为调试人员，我希望请求侧有 Headers、Query String、Cookies、Text、JSON、Raw 子标签，这样我能用熟悉的方式查看请求。
36. 作为调试人员，我希望响应侧有 Headers、Text、JSON、Raw 子标签，这样我能用熟悉的方式查看响应。
37. 作为调试人员，我希望请求和响应的 headers 分别显示，这样不会再把两者混在一起。
38. 作为调试人员，我希望选中 host 或目录时右侧显示该节点的 Overview 和 Summary，这样我看到请求数、状态分布、总流量和耗时。
39. 作为调试人员，我希望节点上还有 Chart 标签显示状态分布，这样我能快速发现错误集中的位置。
40. 作为调试人员，我希望过滤框在树面板底部，这样位置和 Charles 一致。
41. 作为调试人员，我希望树面板顶部能切换 Structure 和 Sequence，这样我在同一处完成视图切换。
42. 作为调试人员，我希望能用 `device:` 过滤某台设备的流量，并有已知设备的自动补全，这样设备栏移除后我仍能区分两部手机。
43. 作为调试人员，我希望旧的 `client:` 过滤和已保存的过滤条件继续可用，这样升级不会破坏我的习惯。
44. 作为调试人员，我希望 PASSTHROUGH 列表在点开顶栏的 passthrough 标签后以弹窗呈现，并保留 Retry，这样设备栏移除后我仍能管理直通。
45. 作为调试人员，我希望断点命中的暂停请求仍然能在详情里编辑并放行，这样本次改动不破坏现有断点流程。
46. 作为调试人员，我希望顶栏只有图标化的常用动作，且不再出现无法操作的静态 Recording 文字，这样界面不误导我。
47. 作为调试人员，我希望 Breakpoints 按钮位于状态栏右下，这样位置和 Charles 一致。
48. 作为调试人员，我希望界面里不再有 Devices 和 Dashboard 两个顶层页，这样导航保持简洁。
49. 作为使用场景 B 的用户，我希望整个 Map Local 流程只靠浏览器完成，这样云主机没有图形界面也能用。
50. 作为使用场景 A 的用户，我希望桌面版里同样的上传流程可用，这样我不必区分两种环境。

## Implementation Decisions

**前置修复（动工前）**：
- 修复命令行入口：用户一传 `-s`，Mitmboard 自身的 addon 就不加载，界面消失。
- 把 `mitmproxy` 依赖从 `>=11` 钉到具体版本。
- 两项均已记录在 v1-scope，不属于本 spec 的新增决策，但必须先完成。

**后端：Map Local**
- 规则模型保持现有字段（启用、host、path、method、文件、状态码）。匹配仍是「先命中者胜、通配、忽略 query、大小写不敏感」。
- 流的元数据新增「命中的 Map Local 规则 id」字段，未命中为空；列表接口和单条详情接口都返回它。addon 在命中时写入。
- 文件缺失或不可读时，仍返回可见的 500，不放行。
- 新增上传接口，接收浏览器上传的文件，写入 `~/.mitmboard/maplocal/`，文件名为内容哈希加扩展名，返回最终的服务端路径；相同内容去重。
- 新增「把已捕获的响应存成文件」接口：以流 id 为输入，把响应体写入同一托管目录，扩展名按响应的 Content-Type 推断，返回路径。二进制响应同样支持。
- 单个托管文件上限 20 MB；超限返回 422，错误信息提示改用手输路径。
- 保存规则（整体 PUT）时，清理托管目录中不再被任何规则引用的文件。托管目录之外的手输路径永远不被清理。
- 现有的规则读写接口和 `maplocal.update` 广播事件保持不变，前端开始订阅。

**前端：过滤**（过滤表达式在前端解析，不涉及后端）
- 过滤表达式新增 `device:`，语义与现有 `client:` 完全相同；`client:` 继续可用，已保存的过滤条件不受影响。
- 输入 `device:` 时，补全列出已知设备的名称和 IP。
- 设备名仍由 User-Agent 自动推导；手动改名的前端入口随设备栏移除，后端的改名接口保留不动。

**前端：布局与导航**
- 页面分为左侧树面板和右侧详情。树面板顶部为 Structure / Sequence 切换，底部为过滤框；分隔条保留。
- 移除设备栏、Devices 页、Dashboard 页，顶层只剩 Inspector。「Connect device」保留为顶栏按钮。
- 顶栏改为图标：清空、重放，以及 Connect device、Export、Settings、Map Local。移除静态的 Recording 文字。Breakpoints 按钮移到状态栏右下，功能不变。
- 顶栏已有的「N passthrough」标签改为可点击，打开直通弹窗，列出主机、状态与 Retry。

**前端：右键菜单**
- 请求行、Structure 的目录与 host 节点都有右键菜单。请求行菜单项：Map Local…、Focus、Copy URL、Copy cURL、Replay、Edit & Resend。目录与 host：Map Local…、Focus。断点与直通的位置预留，本批不接。
- 对已命中 Map Local 的请求，「Map Local…」替换为「编辑 Map Local 规则…」和「停用该规则」。
- 详情页保留对应按钮作为不依赖右键的备用入口。

**前端：Map Local 界面**
- 顶栏 Map Local 入口样式与现有 Breakpoints 一致，带生效指示点。点开是规则列表弹窗：总开关、每条规则的启用勾选、编辑、删除、上移、下移。
- 规则对话框（弹窗里新增、右键创建、编辑共用同一个）字段：host、path、method、状态码，以及文件来源二选一：「使用已捕获的响应」或「上传文件…」。状态码默认取已捕获响应的状态码。对话框里有「query 参数不参与匹配」的提示。
- 预填粒度：请求行为精确 host、精确 path（去掉 query）、该请求的 method；目录为 host 加 `该目录/*`、method 为 any；host 为只填 host。
- 新建规则插到列表最前。
- 前端订阅 `maplocal.update`，多个浏览器标签页之间状态一致。

**前端：Focus**
- 采用 Charles 的方式：Structure 视图中被 Focus 的节点置顶，其余 host 收进 Other Hosts 文件夹；Sequence 视图提供 Focused 开关。
- 官方文档只定义了对 host 的 Focus，目录级 Focus 是我们的扩展。
- Focus 与过滤框的查询取交集；取消 Focus 即回到完整视图。

**前端：树与键盘**
- 单击 host 或目录是选中节点，小三角和 ←→ 负责折叠展开。
- ↑↓ 切换选中并立即加载详情，只保留最后一次请求的结果。⌘/Ctrl+F 聚焦过滤框。Esc 先清除 Focus，再清除选中。
- 暂停中的请求在树和列表里的现有呈现保持不变。

**前端：详情页**
- 选中请求时，标签栏上方显示 `METHOD URL → 状态码`。标签为 Overview、Contents、Summary、Chart、Notes，不做 SSL 标签。
- Contents 上下分屏：上为请求，下为响应，各自有子标签。请求侧：Headers、Query String、Cookies、Text、JSON、Raw；响应侧：Headers、Text、JSON、Raw。不做 Hex、JavaScript、Compressed。
- Overview 中把原来的「Client」行改名为「Device」。Notes 显示 Map Local 命中信息，格式为「Mapped to local file: …」。
- 选中 host 或目录时，右侧是该节点的 Overview、Summary、Chart。Summary 复用现有的统计函数（请求数、状态分布、总流量、平均耗时与 P95），Chart 复用现有的状态分布条形图。Chart 的优先级最低，可在 Summary 之后交付。
- 暂停请求的内联编辑器不受影响，仍在选中暂停请求时显示。

## Testing Decisions

好的测试只验证外部可观察的行为，不断言内部状态或组件实现细节。本 spec 只使用两个接缝：

**接缝 1：后端 HTTP API（`make_app` + `TestClient`）**
- 先例：现有 API 测试与 addon 测试。
- 覆盖：上传（含去重、超限拒绝）、「存为文件」（含扩展名推断、二进制响应）、规则读写与先命中者胜的顺序、保存规则时的托管文件清理（以及手输路径不被清理）、命中标记经 addon 写入后由 `/api/flows` 返回。
- 不新增对 Map Local 引擎内部函数的单测，现有引擎测试保持不动。

**接缝 2：前端整个 `App` 的渲染（vitest + testing-library，mock 掉 `api`）**
- 先例：现有 `App` 级与组件级前端测试的 mock 写法。
- 按用户可见行为断言：右键菜单项与预填值、规则弹窗与对话框的操作、`MAPPED` 徽标、Focus 前后树的变化、Contents 分屏及子标签、节点汇总、键盘导航（含快速连按只保留最后一次）、直通弹窗、过滤框位置，以及 `device:` 与 `client:` 过滤的等价性和自动补全。
- 设备栏、Devices 页、Dashboard 页相关的旧测试随功能移除而删除或改写。

**Playwright 冒烟**：不新增场景，只跟随布局变化修正选择器（例如过滤框移到树面板底部）。mock 服务器没有真实的 Map Local 行为，不扩展。

## Out of Scope

- 手填断点的预填入口，以及断点命中的提示与自动选中（本批的右键菜单不含「断点」项）。
- 手动添加直通主机（后端无对应接口）。
- 录制开关（需要后端支持暂停捕获）。
- Map Remote、Rewrite、弱网模拟、Compose、DNS Spoofing、Mirror、Block List 等 v1-scope 已列明的 Charles 能力。
- 目录映射、UI 内联编辑响应体、query 匹配。
- 分流器与下游代理（代码中尚未实现，也不在 v1 范围）。
- SSL 标签，以及 Hex、JavaScript、Compressed 子标签。
- 设备手动改名的前端入口。

## Further Notes

- 建议的交付顺序：① Map Local（后端的命中标记、上传、托管文件，加前端的规则弹窗、对话框、徽标、Notes）；② 右键菜单、Focus、键盘；③ 详情页重做为 Contents 分屏，并加节点汇总；④ 布局调整（移除设备栏、过滤框下移、顶栏精简、移除 Devices 与 Dashboard）。
- Charles 的行为来自对 Charles 5.2.2 的截图和官方文档：Focus 的 Other Hosts 行为、Notes 里的 Map Local 提示有文档或资料支撑；「选中 host 时右侧出现 Summary 和 Chart」只有第三方资料佐证，实现时以用户自己的 Charles 为准。
- 设备栏移除是对 `docs/v1-scope.md` 原有决定的反转，v1-scope 已同步更新。设备栏曾是场景 A 中区分两部手机的唯一手段，现在改用 `device:` 过滤，直到分流器实现为止。
- 用户在讨论中对设备栏的去留反复调整过，最终决定为移除，并要求视为最终决定。
