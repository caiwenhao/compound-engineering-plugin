# AI Coding 研发流程 v2

基于 compound-engineering（执行引擎）+ superpowers（行为纪律）的自包含研发流程。

```
+----------------------------------------------------------------+
|                    AI Coding 研发流程 v2                         |
|                                                                |
|  +----------------------------------------------------------+  |
|  |           ce-flow -- 智能编排器（单一入口）                 |  |
|  |  状态检测 -> 意图分类 -> 阶段路由 -> 自动推进/遇阻塞停下   |  |
|  +----------------------------------------------------------+  |
|      |                                                         |
|  +--------+  +--------+  +--------+  +--------+  +--------+  |
|  |brainstorm|->|  plan  |->|  code  |->| review |->|  ship  |  |
|  |ce-brain- |  | ce-plan|  |ce-work |  |ce-review|  |git-com-|  |
|  |storm     |  |        |  |        |  |        |  |mit-push|  |
|  +--------+  +--------+  +--------+  +--------+  |-pr     |  |
|                                                    +--------+  |
|                                                        |       |
|                                                   [post-hook]  |
|                                                   ce-compound  |
|                                                                |
|  +----------------------------------------------------------+  |
|  |  Bug Fix 快速路径（LLM 意图判断触发）                      |  |
|  |  ce-debug -> review -> ship                                |  |
|  +----------------------------------------------------------+  |
+----------------------------------------------------------------+
```

---

## 两层架构

| 层 | 来源 | 角色 |
|---|---|---|
| **执行引擎** | compound-engineering-plugin | brainstorm/plan/work/review/debug/compound -- 实际做事的 skill |
| **行为纪律** | superpowers | TDD 反合理化、证据验证、worktree 隔离、systematic-debugging -- 约束怎么做事 |

两层组合 = 自包含研发能力。无其他外部依赖。

---

## ce-flow -- 智能编排器

单一入口（`/ce:flow`），自动检测当前状态并路由到正确阶段。与 `lfg`/`slfg` 共存——后者是"全自动交付流水线"，ce-flow 是"智能路由器"。

### 场景检测（按优先级）

| 信号 | 检测方式 | 路由结果 |
|---|---|---|
| 不在 feature branch | `git branch --show-current` | 推荐创建 feature branch（不强制 worktree） |
| 有未完成工作 | plan status + git status + PR | 展示已有产物，用户确认后恢复到中断阶段 |
| Bug 修复意图 | LLM 意图判断（非关键词匹配） | Bug Fix 快速路径 |
| 用户输入意图 | LLM 意图分类 | 路由到匹配阶段 |
| 存在已有产物 | 扫描 docs/ + 用户确认 | 跳到最近的未完成阶段 |

### 意图分类

不使用关键词匹配。LLM 根据自然语言理解判断：
- Bug 修复信号：有错误信息、"应该 X 但实际 Y"、stack trace、引用 issue
- 新功能信号："add"、"build"、"create"、"improve"、"I want"

### GATE 策略

统一模式：**能自动就自动，遇阻塞停下。**

| 情况 | 行为 |
|---|---|
| 当前阶段通过，下一步明确 | 自动继续 |
| 需要用户决策（多条路线、风险取舍） | 停下，展示选项 |
| Hard blocker（测试失败、merge conflict） | 停下 |
| 进入 ship 但无显式授权 | 停下，请求交付授权 |

### 产物传递

ce-flow 在会话中维护状态变量，直接传递每个阶段的产出路径给下一阶段。扫描 `docs/` 仅作为恢复中断会话的 fallback。

### 主干同步

ship 前按需 rebase origin/main：先检测 `git merge-base --is-ancestor origin/main HEAD`，落后时才 rebase。冲突时停下协助解决。

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
> 核心产出：需求文档（带 R-ID）+ CONTEXT.md 更新 + ADR（条件触发）

### 交互风格

- **Standard/Deep 模式**：采用 grill-me 追问风格
  - 每个问题附带推荐答案 + 理由
  - 走决策树所有分支，不提前收敛
  - 挑战用户回答（"你确定？如果 X 场景呢？"）
  - 能读代码回答的问题，读代码而不是问用户
  - 不接受模糊回答，追问具体细节
- **Lightweight 模式**：保持轻量，快速确认即可

### 领域知识沉淀

brainstorm 过程中同步维护领域知识：

- **CONTEXT.md**：开始时主动读取项目术语表，对话中检测术语冲突即时挑战，新术语解决后立刻写入。懒创建（不存在时第一次需要时创建）。
- **ADR**：满足三条件（难以逆转 + 没上下文会困惑 + 真正的权衡结果）时写入 `docs/adr/`。高门槛，大多数 brainstorm 不会产生 ADR。

### 路由

```
用户输入
    |
    +-- 无方向 -----------> ce-ideate (排名创意) -> ce-brainstorm
    +-- 模糊想法 ---------> ce-brainstorm (Standard/Deep, grill 风格)
    +-- 明确小需求 -------> ce-brainstorm (Lightweight)
    |
    v
document-review (条件触发: R-ID >8 / 高风险 / 用户要求)
```

| Skill | 角色 |
|---|---|
| `ce-ideate` | 创意发散，无方向时生成候选 |
| `ce-brainstorm` | 需求定义（唯一出口），产出 R-ID 需求文档 + CONTEXT.md/ADR 更新 |
| `document-review` | 多人格审查（条件触发） |

### 审查门禁

| 信号 | 动作 |
|---|---|
| Deep brainstorm / R-ID >8 / 高风险 | 强制 `document-review` |
| Lightweight 且无风险信号 | opt-in |

审查循环：审查 -> 修复 -> 再审查，直到零 P0/P1、达 3 轮上限、或收敛。

---

## Phase 2: Plan -- "怎么做"

> 从需求文档到可执行的实施计划。
>
> 核心 skill：`ce-plan`
>
> 核心产出：计划文档（Implementation Units + Test Scenarios + 架构深度分析）

### 架构深度分析（Standard/Deep）

plan 阶段研究时主动识别变更区域的架构摩擦点：
- 用深模块/浅模块框架评估现有模块和计划新建的模块
- 浅模块（接口复杂度 ≈ 实现复杂度）标记为改进机会
- 在自然路径上的架构改进纳入 Implementation Units
- 不强制改进与当前工作无关的模块

### 路由

```
需求文档 (R1, R2, R3)
    |
    v
ce-plan
    |  并行研究 Agent (repo-research + learnings + best-practices)
    |  架构深度分析（深模块/浅模块评估）
    |  Requirements Trace 回链需求文档
    |  Implementation Units (垂直切片，非水平分层)
    |  Test Scenarios
    |
    v
document-review (强制)
```

### 审查门禁

`document-review` 强制通过后才能进入 code 阶段。循环同上。

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
ce-work (执行所有 Implementation Units)
    |
    所有 Unit 完成后:
    |  -> simplify (superpowers: 复用/质量/效率三维清理)
    |  -> ce-review mode:autofix (只处理 safe_auto)
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
> 核心 skill：`ce-review`
>
> 核心产出：PASS / NEEDS_WORK 裁决

### 路由

```
代码变更
    |
    v
ce-review interactive (多轮循环最多 3 轮)
    |
    |-- 始终启用 persona: correctness, testing, maintainability, project-standards, agent-native
    |
    |-- 按 diff 内容自动启用 persona:
    |   auth/session            -> security-reviewer
    |   DB/cache/async          -> performance-reviewer
    |   routes/serializer       -> api-contract-reviewer
    |   db/migrate/schema       -> data-migrations-reviewer
    |   diff >= 50 行           -> adversarial-reviewer
    |   新建 class/module/service -> architecture-depth-reviewer
    |   CLI 命令定义             -> cli-readiness-reviewer
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

> 从代码到 PR。
>
> 核心 skill：`git-commit-push-pr`
>
> 核心产出：PR

### 前置

- 按需 rebase origin/main（检测是否落后，落后才 rebase）
- Phase 4 PASS 证据绑定当前 diff

### 路径

```
验证通过的代码
  |
  [按需: git rebase origin/main]
  |
  v
git-commit-push-pr -> PR
```

不提供直接 push main 的路径。所有交付通过 PR 完成。

### Post-hook: 知识沉淀

ship 完成后自动触发 `ce-compound`（ce-flow 自动调用，不需要用户记得）：
- 非平凡 bug 已解决 -> 记录解决方案到 `docs/solutions/`
- 新架构/模式 -> 记录可复用经验
- 机械修改/无新知识 -> 跳过（skill 内部判断）

### Worktree 策略

ce-flow 推荐使用 worktree 但不强制。用户可以选择 feature branch 或 worktree。

---

## Bug Fix 快速路径

> 检测到 bug 修复意图时，跳过 brainstorm/plan，进入专用修复流程。
>
> 核心 skill：`ce-debug`（编排器，串联 reproduce-bug + systematic-debugging + ce-work + ce-review）
>
> 核心原则：**根因先于修复**。

```
用户报告 bug
    |
    v
Signal 0: 工作区检查（推荐 feature branch）
    |
    v
Step 1: 构建反馈循环 (ce-debug)
    10 种策略（failing test / curl / CLI / headless browser /
    replay trace / throwaway harness / fuzz / bisect / differential / manual-assisted）
    产出: 快速、确定性的 pass/fail 信号
    ⛔ 无法构建 -> 停下要更多上下文
    |
    v
Step 2: 根因定位 (systematic-debugging skill)
    假设驱动，逐一证伪
    [DEBUG-xxxx] 标签化所有调试日志
    产出: 定位到具体代码行 + 因果链
    ⛔ skill 内部判断无法定位 -> 停下报告
    |
    v
Step 3: 修复 (TDD)
    复现固化为回归测试(RED) -> 最小修复(GREEN)
    不扩大修复范围
    |
    v
Step 4: 验证
    回归测试通过 + 全量测试无新失败
    清理所有 [DEBUG-xxxx] 标签日志
    ce-review mode:autofix
    |
    v
-> ship (用户触发)
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
| 6 | **隔离推荐** -- 推荐在 feature branch/worktree 中工作，不强制 | `using-git-worktrees` (superpowers) |
| 7 | **提交由用户触发** -- Phase 1-4 不 commit/push/PR | `git-commit-push-pr` |

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
| `ce-flow` | 入口 | 智能编排器，状态检测 + 意图路由 |
| `ce-brainstorm` | brainstorm | 需求定义（grill 风格 + 术语沉淀） |
| `ce-ideate` | brainstorm | 创意发散 |
| `document-review` | brainstorm, plan | 文档多人格审查 |
| `ce-plan` | plan | 计划创建（含架构深度分析） |
| `ce-work` | code | 执行 Implementation Units + post-cleanup |
| `ce-review` | code (autofix), review | 多角色代码审查（含 architecture-depth-reviewer） |
| `ce-debug` | bug fix | 编排器：反馈循环 -> 根因 -> 修复 -> 验证 |
| `git-commit` | ship | 单次提交 |
| `git-commit-push-pr` | ship | 提交 + 推送 + 开 PR |
| `ce-compound` | ship (post-hook) | 知识沉淀 |

### 行为纪律（superpowers）

| Skill | 守护铁律 | 角色 |
|---|---|---|
| `test-driven-development` | #2 测试先于代码 | TDD 反合理化，强制 RED-GREEN-REFACTOR |
| `systematic-debugging` | #3 根因先于修复 | 禁止"试试看"式修复 |
| `verification-before-completion` | #4 证据先于断言 | 跑命令才能说通过 |
| `receiving-code-review` | #5 验证先于采纳 | 审查反馈先验证再实现 |
| `using-git-worktrees` | #6 隔离推荐 | worktree 隔离（推荐） |
| `simplify` | code (post) | 复用/质量/效率清理 |
| `dispatching-parallel-agents` | -- | 多独立任务并行 |
| `brainstorming` | #1 设计先于实现 | 需求探索纪律 |

---

## 文档追溯链

```
brainstorm          plan              code            review          ship
需求文档 ---------> 实施计划 -------> 代码变更 -----> PASS/FAIL ----> PR
R1,R2,R3            Impl Units        staged diff     safe_auto fix   |
CONTEXT.md          架构深度分析                      gated 裁决      |
ADR (条件)          Test Scenarios                    depth review    |
                                                                      v
                                                                 [post-hook]
                                                                 ce-compound
                                                                      |
plan (ce-plan) <-- learnings 自动搜索 --------------------------------+
```

R-ID 从 brainstorm 贯穿到 review。知识从 ship 回流到 plan。领域语言从 brainstorm 贯穿到所有阶段（通过 CONTEXT.md）。

---

## 设计决策记录

本文档反映的实现决策（与初始设计的差异）：

| 决策 | 理由 |
|------|------|
| 不改名现有 skill（git-commit 等保持原名） | 避免 breaking change，文档用逻辑角色名 |
| ce-flow 与 lfg/slfg 共存 | 定位不同：智能路由 vs 全自动流水线 |
| 不建 ce-simplify-code | superpowers 的 simplify 已覆盖 |
| Worktree 推荐但不强制 | 小任务摩擦感太重 |
| 产物检测 + 用户确认 | 避免误判已有文档的相关性 |
| ce-work 完成后统一 review，不分批 | autofix 处理的 safe_auto 问题不因晚发现而变难 |
| Ship 只走 PR 路径 | 直接 push main 风险高，不提供快捷方式 |
| 按需 rebase（非强制） | main 没变化时 rebase 无意义 |
| Bug 意图用 LLM 判断，非关键词匹配 | "fix the typo" 不是 bug |
| ce-debug 信任子 skill 内部机制 | 避免两层控制冲突 |
| ce-compound 自动触发 | 知识沉淀不应依赖人记得去做 |
