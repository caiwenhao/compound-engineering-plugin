# AI Coding 研发流程 v2

基于 compound-engineering（执行引擎）+ superpowers（行为纪律）的自包含研发流程。

```
┌────────────────────────────────────────────────────────────────┐
│                    AI Coding 研发流程 v2                         │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           flow -- 智能编排器（单一入口）                    │  │
│  │  自动检测当前阶段 -> 自动推进 -> 遇阻塞停下                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│      |                                                         │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  │
│  │brainstorm│->│  plan  │->│  code  │->│ review │->│  ship  │  │
│  │ ce-brain │  │ ce-plan│  │ce-work │  │ce-code │  │ce-commit│  │
│  │ storm    │  │        │  │        │  │-review │  │-push-pr│  │
│  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘  │
│                                                        |       │
│                                                   [post-hook]  │
│                                                   ce-compound  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Bug Fix 快速路径（检测到 bug 意图时）                      │  │
│  │  ce-debug -> code -> review -> ship                        │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

---

## 两层架构

| 层 | 来源 | 角色 |
|---|---|---|
| **执行引擎** | compound-engineering-plugin | brainstorm/plan/work/review/commit/debug/compound — 实际做事的 skill |
| **行为纪律** | superpowers | TDD 反合理化、证据验证、worktree 隔离、systematic-debugging — 约束怎么做事 |

两层组合 = 自包含研发能力。无其他外部依赖。

---

## flow -- 智能编排器

单一入口，自动检测当前状态并路由到正确阶段。

### 场景检测（按优先级）

| 信号 | 检测方式 | 路由结果 |
|---|---|---|
| 不在任务工作区 | `git rev-parse --abbrev-ref HEAD` | 调用 `using-git-worktrees` 创建工作区 |
| 有未完成工作 | plan status + git status + PR | 恢复到中断的阶段 |
| Bug 修复意图 | 关键词（bug/fix/修复/报错/crash） | Bug Fix 快速路径 |
| 用户输入意图 | 意图分类 | 路由到匹配阶段 |
| 存在已有产物 | 扫描 docs/ | 跳到最近的未完成阶段 |

### GATE 策略

统一模式：**能自动就自动，遇阻塞停下。**

| 情况 | 行为 |
|---|---|
| 当前阶段通过，下一步明确 | 自动继续 |
| 需要用户决策（多条路线、风险取舍） | 停下，展示选项 |
| Hard blocker（测试失败、工作区缺失、merge conflict） | 停下 |
| 进入 ship 但无显式授权 | 停下，请求交付授权 |

### 主干同步

ship 前强制 rebase origin/main。rebase 有冲突则协助解决后继续。

### 阶段跳过规则

| 条件 | 跳过 |
|---|---|
| Bug 修复 | 走快速路径，不走标准 5 阶段 |
| 需求文档已存在且已批准 | brainstorm |
| 计划已存在且已审查 | plan |
| 仅文档变更 | brainstorm, plan -> 直接 code |

---

## Phase 1: Brainstorm -- "做什么 + 长什么样"

> 从模糊想法到明确的需求定义。合并了原 discover + design。
>
> 核心 skill：`ce-brainstorm`
>
> 核心产出：需求文档（带 R-ID）

### 路由

```
用户输入
    |
    +-- 无方向 -----------> ce-ideate (排名创意) -> ce-brainstorm
    +-- 模糊想法 ---------> ce-brainstorm (Standard/Deep)
    +-- 明确小需求 -------> ce-brainstorm (Lightweight)
    |
    v
ce-doc-review (条件触发: R-ID >8 / 高风险 / 用户要求)
```

| Skill | 角色 |
|---|---|
| `ce-ideate` | 创意发散，无方向时生成候选 |
| `ce-brainstorm` | 需求定义（唯一出口），产出 R-ID 需求文档 |
| `ce-doc-review` | 多人格审查（条件触发） |

### 审查门禁

| 信号 | 动作 |
|---|---|
| Deep brainstorm / R-ID >8 / 高风险 | 强制 `ce-doc-review` |
| Lightweight 且无风险信号 | opt-in |

审查循环：审查 -> 修复 -> 再审查，直到零 P0/P1、达 3 轮上限、或收敛。

---

## Phase 2: Plan -- "怎么做"

> 从需求文档到可执行的实施计划。
>
> 核心 skill：`ce-plan`
>
> 核心产出：计划文档（Implementation Units + Test Scenarios）

### 路由

```
需求文档 (R1, R2, R3)
    |
    v
ce-plan
    |  并行研究 Agent (repo-research + learnings + best-practices)
    |  Requirements Trace 回链需求文档
    |  Implementation Units (垂直切片，非水平分层)
    |  Test Scenarios
    |
    v
ce-doc-review (强制)
```

### 审查门禁

`ce-doc-review` 强制通过后才能进入 code 阶段。循环同上。

### 反模式：水平切片

Implementation Unit 必须是端到端垂直切片，不是单层水平切片。

```
错误: Unit 1 所有 model / Unit 2 所有 controller / Unit 3 所有 view
正确: Unit 1 用户注册(全栈) / Unit 2 用户登录(全栈) / Unit 3 密码重置(全栈)
```

---

## Phase 3: Code -- "写代码"

> 按计划执行开发，持续验证。
>
> 核心 skill：`ce-work`
>
> 核心产出：代码变更（staged/unstaged，不 commit）

### 路由

```
计划文档
    |
    v
ce-work (按 2-3 个 Implementation Units 切批执行)
    |
    每批完成后:
    |  -> ce-code-review mode:autofix (只处理 safe_auto)
    |
    所有 Unit 完成后:
    |  -> ce-simplify-code (复用/质量/效率三维清理)
    |  -> final ce-code-review mode:autofix
```

### 自动触发的辅助能力

| 信号 | 触发 |
|---|---|
| 任何行为变更 | `test-driven-development`（superpowers 纪律：RED -> GREEN -> REFACTOR） |
| 运行时遇 bug | `systematic-debugging`（superpowers）-> `ce-debug` |
| 多个独立任务 | `dispatching-parallel-agents`（superpowers） |

### 铁律执行

- 无失败测试，不写生产代码（TDD 默认强制）
- 无根因分析，不尝试修复
- 3 次修复失败，停下质疑架构
- 不主动提交

---

## Phase 4: Review -- "质量关"

> 总体审查，处理需要裁决的问题。
>
> 核心 skill：`ce-code-review`
>
> 核心产出：PASS / NEEDS_WORK 裁决

### 路由

```
代码变更
    |
    v
ce-code-review interactive (多轮循环最多 3 轮)
    |
    |-- 始终启用 persona: correctness, testing, maintainability, project-standards
    |
    |-- 按 diff 内容自动启用 persona:
    |   auth/session       -> security-reviewer
    |   DB/cache/async     -> performance-reviewer
    |   routes/serializer  -> api-contract-reviewer
    |   db/migrate/schema  -> data-migrations-reviewer
    |   diff >= 50 行      -> adversarial-reviewer
    |
    v
置信度过滤 (>=0.60)
    |
    v
safe_auto 自动修复 -> gated_auto/manual 交用户裁决
```

### Phase 3 vs Phase 4 的 review 区别

| | Phase 3 (code 内嵌) | Phase 4 (完整) |
|---|---|---|
| 模式 | `mode:autofix` | `interactive` |
| 目的 | 实现阶段自动修复 safe_auto | 总体审查，处理 gated/manual 裁决 |
| 决策 | 不问用户 | 需要时向用户展示裁决项 |

---

## Phase 5: Ship -- "交付"

> 从代码到合并/PR。
>
> 核心 skill：`ce-commit-push-pr` / `ce-commit`
>
> 核心产出：PR 或合并到 main

### 前置

- 强制 rebase origin/main
- Phase 4 PASS 证据绑定当前 diff

### 两条路径

```
验证通过的代码
  |
  [强制: git rebase origin/main]
  |
  +-- 用户要求合并到 main -----> squash merge + 中文 commit -> push main
  |                              -> 自动删除 worktree
  |
  +-- 用户要求 PR -------------> ce-commit-push-pr
                                  -> 自动删除 worktree
```

### Post-hook: 知识沉淀

ship 完成后自动触发 `ce-compound`：
- 非平凡 bug 已解决 -> 记录解决方案到 `docs/solutions/`
- 新架构/模式 -> 记录可复用经验
- 机械修改/无新知识 -> 跳过

### Worktree 清理

合并/PR 确认后，自动删除当前任务 worktree + 本地 feature branch。

---

## Bug Fix 快速路径

> 检测到 bug 修复意图时，跳过 brainstorm/plan，进入专用修复流程。
>
> 核心原则：**根因先于修复**。

```
用户报告 bug
    |
    v
Signal 0: 工作区检查
    |
    v
Step 1: 复现 (ce-debug Phase 1)
    产出: 可稳定触发的复现步骤 + 失败断言
    ⛔ 无法复现 -> 停下要更多上下文
    |
    v
Step 2: 根因定位 (ce-debug Phase 2-3)
    3-5 个可证伪假设，逐一验证
    产出: 定位到具体代码行 + 因果链
    ⛔ 3 轮失败 -> 停下质疑架构
    |
    v
Step 3: 修复 (= code 子集)
    TDD: 复现固化为回归测试(RED) -> 最小修复(GREEN)
    不扩大修复范围
    |
    v
Step 4: 验证 (= review 子集)
    回归测试通过 + 全量测试无新失败
    |
    v
-> ship (同标准路径)
```

---

## 七条铁律

| # | 铁律 | 守护 skill |
|---|---|---|
| 1 | **设计先于实现** -- 需求批准前不碰代码 | `ce-brainstorm` |
| 2 | **测试先于代码** -- 无失败测试不写生产代码 | `test-driven-development` (superpowers) |
| 3 | **根因先于修复** -- 不理解为什么坏就不能修 | `systematic-debugging` (superpowers) + `ce-debug` |
| 4 | **证据先于断言** -- 没跑命令不能说"通过了" | `verification-before-completion` (superpowers) |
| 5 | **验证先于采纳** -- 审查反馈先验证再实现 | `receiving-code-review` (superpowers) |
| 6 | **工作区先于工作** -- 必须在任务专属 worktree 中 | `using-git-worktrees` (superpowers) |
| 7 | **提交由用户触发** -- Phase 1-4 不 commit/push/PR | `ce-commit-push-pr` |

---

## 编码行为约束

以下约束贯穿 Phase 3 (code) 和 Phase 4 (review)：

- **明确假设** -- 开始前列出关键假设；多种合理解释时让用户选，不静默挑一个
- **手术刀修改** -- 只改和任务直接相关的行；不顺手改进相邻代码；匹配现有风格
- **孤儿清理** -- 清理自己改动产生的未使用 import/变量；不清理原有 dead code
- **不确定就停** -- 不靠猜继续；存在更简单方案时说出来让用户决定

---

## Skill 完整清单

### 执行引擎（compound-engineering）

| Skill | 阶段 | 角色 |
|---|---|---|
| `ce-brainstorm` | brainstorm | 需求定义 |
| `ce-ideate` | brainstorm | 创意发散 |
| `ce-doc-review` | brainstorm, plan | 文档多人格审查 |
| `ce-plan` | plan | 计划创建 |
| `ce-work` | code | 批量执行 Implementation Units |
| `ce-simplify-code` | code | 复用/质量/效率清理 |
| `ce-code-review` | code (autofix), review | 多角色代码审查 |
| `ce-debug` | bug fix | 根因定位 + 修复 |
| `ce-commit` | ship | 单次提交 |
| `ce-commit-push-pr` | ship | 提交 + 推送 + 开 PR |
| `ce-compound` | ship (post-hook) | 知识沉淀 |

### 行为纪律（superpowers）

| Skill | 守护铁律 | 角色 |
|---|---|---|
| `test-driven-development` | #2 测试先于代码 | TDD 反合理化，强制 RED-GREEN-REFACTOR |
| `systematic-debugging` | #3 根因先于修复 | 禁止"试试看"式修复 |
| `verification-before-completion` | #4 证据先于断言 | 跑命令才能说通过 |
| `receiving-code-review` | #5 验证先于采纳 | 审查反馈先验证再实现 |
| `using-git-worktrees` | #6 工作区先于工作 | 强制 worktree 隔离 |
| `dispatching-parallel-agents` | -- | 多独立任务并行 |
| `brainstorming` | #1 设计先于实现 | 需求探索纪律 |

---

## 文档追溯链

```
brainstorm          plan              code            review          ship
需求文档 ---------> 实施计划 -------> 代码变更 -----> PASS/FAIL ----> PR/merge
R1,R2,R3            Impl Units        staged diff     safe_auto fix   |
                    Test Scenarios                     gated 裁决      |
                                                                      v
                                                                 [post-hook]
                                                                 ce-compound
                                                                      |
plan (ce-plan) <-- learnings 自动搜索 --------------------------------+
```

R-ID 从 brainstorm 贯穿到 review。知识从 ship 回流到 plan。
