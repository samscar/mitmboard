# 领域文档

说明各个工程 skill 在探查代码库时，应如何消费本仓库的领域文档。

## 探查之前先读这些

- 根目录的 **`CONTEXT.md`**；或
- 若根目录存在 **`CONTEXT-MAP.md`**，则它指向每个上下文各一份 `CONTEXT.md`，读其中与本次主题相关的每一份。
- **`docs/adr/`** —— 读与即将改动的区域相关的 ADR。多上下文仓库还要看 `src/<context>/docs/adr/` 下按上下文划分的决策。

这些文件若有缺失，**静默略过**。不要指出缺失，也不要主动建议补建。`/domain-modeling` skill（经由 `/grill-with-docs` 与 `/improve-codebase-architecture` 触达）会在术语或决策真正确定时才按需创建。

## 文件布局

本仓库为单上下文：

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-fork-mitmboard-as-base.md
│   └── ...
└── mitmboard/  web/
```

多上下文仓库（根目录存在 `CONTEXT-MAP.md`）的形态仅作参照：

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← 系统级决策
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← 上下文级决策
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## 使用术语表里的词汇

输出中一旦命名某个领域概念（issue 标题、重构提案、假设、测试名），就用 `CONTEXT.md` 里的定义，不要漂移到术语表显式回避的同义词。

若需要的概念尚未进入术语表，这是一个信号：要么你在发明项目并不使用的语言（重新考虑），要么确实存在缺口（留给 `/domain-modeling` 记录）。

## 指出 ADR 冲突

若你的输出与既有 ADR 相矛盾，要显式提出，而不是默默覆盖：

> _与 ADR-0007（event-sourced orders）相矛盾 —— 但值得重开，因为……_
