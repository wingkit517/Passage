# 开发记录模板（TEMPLATE.md）

> ⚠️ **新建记录必须从本文件复制，不得删减必填字段或章节**。复制后把所有 `<>` 占位替换掉。
> 格式的完整规则见 `../AGENTS_记录规范.md`（本文件只是模板，不是权威源）。

---
record_id: DEV-<YYYYMMDD>-<HHMM>-<agent-id>-<topic>
title: "<任务标题>"
status: planned
started_at: "<YYYY-MM-DDTHH:mm:ss+08:00>"
completed_at: null
timezone: "Asia/Shanghai"
agents:
  - id: "<agent-id>"
    role: "<架构设计/开发/测试/验收等>"
    primary: true
    contribution: "<负责的具体工作>"
related_issues: []
related_commits: []
tags: [<模块名>, feature|bugfix|test|docs, <architecture>]
---

<!-- ↑ frontmatter 之后，正文九段，逐段写。段落标题不得删减。 -->

## 一、目标与背景

<为什么做这件事；不做会怎样。2–5 行。>

## 二、范围（包含 · 不包含）

- **包含**：<…>
- **不包含**：<明确写出去哪了 / 谁负责 / 为什么不做>

## 三、方案与关键决策

| 时间 | Agent | 决策 | 原因 | 影响 |
|---|---|---|---|---|
| <ISO 时间> | <id> | <…> | <…> | <…> |

## 四、过程时间线

- `<HH:mm>` <发生了什么>
- `<HH:mm>` <下一步>　<!-- 过程中持续追加，不得交付时一次性补写 -->

## 五、变更清单

- <路径>：<改了什么>

## 六、测试与验收

| 检查项 | 命令 | 结果 | 时间 | 执行 Agent |
|---|---|---|---|---|
| <…> | <…> | <通过/失败/未跑> | <ISO 时间> | <id> |

## 七、问题与踩坑

- <现象 → 原因 → 处置。 reusable 的提炼进 `../../engineering/踩坑与原理.md`，此处留一行指针。>

## 八、风险技术债与未完成事项

- <…>（登记到 `../../Passage_3b 决策·风险与缺口.md` 的写编号，此处写指针）

## 九、Agent 协作与交接 / 最终结果

- **交接给下一个 Agent 的话**：<…>
- **最终结果**：<完成 / 部分完成 / 取消，对应 commit 号>
