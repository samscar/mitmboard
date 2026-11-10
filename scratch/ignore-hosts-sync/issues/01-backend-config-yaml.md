# 01 — 后端：config.yaml 读写层、备份与旧数据删除

**Spec:** ../spec.md
**Blocked by:** None

**Status:** resolved (2026-11-09)

## What to build

1. **新增读写层**（建议 `mitmboard/ignorehosts.py`）：
   - 用 `ruamel.yaml.YAML(typ="rt")` 读改写 `~/.mitmproxy/config.yaml` 的 `ignore_hosts`；保留注释头、其它键、条目顺序与引号风格。
   - `ignore_hosts` 缺失则创建该块；非 list / 非法 YAML 视为结构异常，不猜测、不修复用户文件。
   - 每条必须是字符串且 `re.compile` 通过；非法 regex 抛可识别错误，不落盘。
   - 暴露「块规范化内容」的哈希或等价 revision，供 02 票做冲突比对（只覆盖 `ignore_hosts` 块，注释或其它键变化不算冲突）。
2. **原子写与备份**：沿用 `clients.py` 的 `mkstemp` + `os.replace`；首次写入前生成 `~/.mitmproxy/config.yaml.bak`，已存在则不覆盖。
3. **显式依赖**：在 `pyproject.toml` 的 `dependencies` 中声明 `ruamel.yaml`（当前是 mitmproxy 的传递依赖，禁止依赖传递关系）。不使用 mitmproxy 的 `optmanager.save()`。
4. **删除旧数据**：`ClientRegistry` 移除 `ssl_proxying.exclude` 的读写与校验；首次读取 `config.json` 时删除该键，保留 `ssl_proxying.enabled`（缺省 True）。不做转换、不迁移、不备份旧 `exclude`；用户现有的 `10.53.*.*` 由用户重新添加。
5. **写失败语义**：任何写盘 / 解析 / 校验失败都不得留下半成品，且不触发运行时热更新（由 02 票保证），向上返回明确错误。

## Acceptance

- [ ] 改 `ignore_hosts` 后，文件注释头、其它键、顺序与引号风格保持不变
- [ ] `ignore_hosts` 缺失可创建；非 list / 非法 YAML / 非法 regex 均返回错误且不写盘
- [ ] 原子替换生效；首次写入生成 `.bak`，重复写入不覆盖已有备份
- [ ] `pyproject.toml` 显式声明 `ruamel.yaml`
- [ ] `config.json` 的 `ssl_proxying.exclude` 被删除，`enabled` 保留且可读写
- [ ] 单测覆盖上述成功与失败路径

## Comments

2026-11-09 实现：`mitmboard/ignorehosts.py`（`read_patterns` / `write_patterns` / `revision_of` / `ConfigError`），`pyproject.toml` 显式声明 `ruamel.yaml>=0.18`，`clients.py` 的 `ssl_proxying()` 只保留 `enabled` 并在首次读取时删除旧 `exclude` 键。发现 ruamel 0.19.x 需 `preserve_quotes = True` 才能保住单引号风格，已在读写层固定。测试见 `tests/test_ignorehosts.py` 与 `tests/test_clients.py`。
