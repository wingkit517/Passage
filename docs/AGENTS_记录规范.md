# AGENTS_记录规范 — 开发记录怎么放、怎么命名、怎么填

> **职责**：开发记录子系统的唯一权威源（存放 / 命名 / frontmatter / 状态闭环 / 查找）。
> **体积**：见自检（上限 8 KB）｜**更新**：2026-09-27（文档体系重构时新建）
> **上级索引**：`Passage_0 文档地图.md` §1
> **本文不包含**：纪律与红线 → `AGENTS.md` §1；当前状态 → `Agent交办事项.md`；记录正文 → `development-logs/`
> ⚠️ **什么时候读本文**：**新建或更新开发记录之前**读。不写记录就不用读。

---

## §1 存放与命名

```
docs/development-logs/YYYY-MM/YYYY-MM-DD-HHmm_<agent-id>_<topic>.md
```

- `agent-id`、`topic` 只用**小写英文字母、数字、连字符**。
- 同分钟同名追加 `-02`、`-03`。
- **新建必须从 `TEMPLATE.md` 复制**，不得删减必填字段或章节。
- 新建或完成后**必须同步 `README.md` 总索引**（按开始时间倒序插表头）。

---

## §2 标识与状态

- `record_id = DEV-YYYYMMDD-HHMM-<agent-id>-<topic>`，与文件名对应、项目内唯一。
- `status` 五值闭环：`planned / in_progress / blocked / completed / cancelled`。
- 时间一律 ISO 8601 **带时区**：`YYYY-MM-DDTHH:mm:ss+08:00`，**不得省略时区**。

---

## §3 frontmatter 模板

```yaml
---
record_id: DEV-YYYYMMDD-HHMM-agent-id-topic
title: "任务标题"
status: in_progress
started_at: "YYYY-MM-DDTHH:mm:ss+08:00"
completed_at: null
timezone: "Asia/Shanghai"
agents:
  - id: "agent-id"
    role: "架构设计/开发/测试/验收等"
    primary: true
    contribution: "负责的具体工作"
related_issues: []
related_commits: []
tags: [模块名, feature|bugfix|test|docs, architecture]
---
```

---

## §4 正文章节（九段，逐段写）

1. 目标与背景
2. 范围（包含 · 不包含）
3. 方案与关键决策（表：时间 · Agent · 决策 · 原因 · 影响）
4. 过程时间线
5. 变更清单
6. 测试与验收（表：检查项 · 命令 · 结果 · 时间 · 执行 Agent）
7. 问题与踩坑
8. 风险技术债与未完成事项
9. Agent 协作与交接 / 最终结果

**更新流程**：① 开工即建记录、置 `in_progress`、加入索引 → ② 过程中**持续追加**时间线 / 决策 / 踩坑，**不得交付时一次性补写** → ③ 接手 / 转交 / 阻塞立即记录 → ④ 全部检查通过才可置 `completed` → ⑤ 取消 / 受阻置 `cancelled` / `blocked`，写明原因与恢复条件。

---

## §5 查找与「不要通读」

> ⚠️ **`development-logs/` 不设体积上限，也绝对不要通读。** 它随记录数单调增长，通读是纯浪费。

| 场景 | 命令 |
|---|---|
| 找最近 3 条 | `ls -t docs/development-logs/*/*.md \| head -3` |
| 按记录 ID | `rg 'record_id: DEV-'` |
| 按 Agent | `rg 'id: <agent-id>'` |
| 按状态 | `rg 'status: (blocked\|in_progress)'` |
| 按主题 | `rg '<关键词>'` |

**历史不回改**：记录是**当时状态的原文快照**，完成后不回改、不删减章节。事后状态变化写在**新记录**或索引行内加注（「该记录中 X 已于某日 Y，见 …」），不在原文上修改。
