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
    +-- 知识检索（无条件）: learnings-researcher 搜索相关历史
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

## Phase 2.5: Spike Validation (Conditional) -- "能不能"

> 在投入完整实现前，用最小代码验证高风险假设。
>
> 执行者：`ce-flow` 直接处理（不委托子 skill）
>
> 核心产出：假设验证结果（VERIFIED / FALSIFIED）+ plan Risk table 更新

### 触发条件（任一）

- Plan 的 Risk table 或 Implementation Unit 中包含 `Spike Assumptions` 字段
- `document-review` 的 feasibility-reviewer 在 plan 审查时标记了未验证的外部依赖假设

### 跳过条件

- Plan 中无 spike 假设
- 所有外部依赖在代码库中已有使用先例（已证明可行）

### 执行

```
spike 假设列表
    |
    v
对每个假设:
    写最小验证代码到 .context/compound-engineering/spike/<assumption-slug>/
    运行验证（import check / API call / build step / integration test）
    记录结果: VERIFIED 或 FALSIFIED
    |
    v
删除 .context/compound-engineering/spike/ 目录（throwaway）
更新 plan Risk table 中的验证状态
```

### 失败路由

| 情况 | 路由 |
|------|------|
| FALSIFIED 假设影响核心需求（R-ID） | 停下，回到 brainstorm 修订需求或寻找替代方案 |
| FALSIFIED 假设只影响实现路径（非核心 R-ID） | 回到 plan 局部修订受影响 Unit 的方案 |

局部修订后仅跑 feasibility-reviewer 审查修订部分（不跑完整 document-review）。

### 设计原则

- Spike 代码是 throwaway，不保留、不演化为生产代码
- Spike 验证的知识记录在 plan Risk table 中，代码本身不需要留
- Spike 应最小化——只验证"能不能"，不解决"怎么写好"

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

### Review -> Rework Protocol

当 ce-review 返回 NEEDS_WORK 时，进入 rework 循环：

```
NEEDS_WORK + finding list
    |
    v
展示 findings，用户可 reject 个别 finding
    |
    v
确定 TDD 纪律（按 autofix_class）:
    gated_auto + correctness/security -> TDD 强制（写失败测试 -> 修复）
    其他（maintainability/style）     -> 直接修复，跑现有测试
    |
    v
内联修复 findings（ce-flow 处理，不委托 ce-work）
    |
    v
重新 ce-review，计数 round
    |
    v
3 轮后仍 NEEDS_WORK -> 升级
    |
    +-- Accept risk: 带已知问题继续 ship（记录到 PR description）
    +-- Split PR: 按 Implementation Unit 拆分，进入增量交付路径
    +-- Abandon: 放弃变更，不提交
```

**Rework 范围**：ce-review 输出的 finding list 自动界定 rework scope。用户可在 rework 开始前 reject 个别 finding（误报或故意设计），被 reject 的 finding 不计入 rework。

**TDD 降级规则**：
- `gated_auto` + 类别为 correctness 或 security → 强制 TDD（写失败测试证明 finding，再修复使其通过）
- 所有其他 finding（maintainability、style、performance）→ 直接修复，修复后跑现有测试确认无破坏

**3 轮升级**：finding 在 3 轮修复后仍未收敛，停下展示剩余 finding 和三个选项。这是典型的"需要用户决策"场景。

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
    知识检索: learnings-researcher 搜索同类 bug 历史解法
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

## 增量交付路径 (Conditional)

> 大特性按 Unit 分批交付，降低 PR 体积和 review 风险。
>
> 执行者：`ce-flow` 编排
>
> 默认行为：单 PR。增量交付是例外路径。

### 激活条件（任一）

- Plan 中存在独立 Implementation Unit（无依赖链）且总 diff 预计 >300 行
- Review 3 轮升级时用户选择 "Split PR"

### 机制：Sequential PRs

```
对每个独立 Unit（或 Unit 组）:
  1. Code (ce-work 单 Unit 范围)
  2. Review (ce-review)
  3. Ship (git-commit-push-pr -> merge)
  4. Sync: git pull fresh main
  |
  v
下一个 Unit 从新 main 开始
```

### 排序规则

- 无未交付依赖的 Unit 优先 ship
- 所有剩余 Unit 都有依赖时，按依赖顺序 ship

### 状态跟踪

ce-flow 在会话上下文中跟踪：
- `shipped_units: [Unit 1, Unit 3]`
- `remaining_units: [Unit 2, Unit 4]`

会话中断时，resume detection 通过 git history（已合入 main 的 PR）重建状态。

---

## Pivot Protocol (Cross-Cutting)

> 实现过程中发现需求偏差时的回退协议。
>
> 触发点：Phase 3 (Code)
>
> 核心原则：**Agent 检测 + 用户确认**。

### 检测信号

- Implementation Unit 的实现与需求（R-ID）矛盾
- Plan 中的假设在编码时被证伪
- 实现需要的变更违反 plan 的 scope boundary

### 流程

```
ce-work 检测到偏差
    |
    v
STOP 实现，报告用户:
"Unit [X] 的实现与需求 [R-ID] 矛盾: [解释]"
    |
    v
用户确认 pivot? (可能是误报)
    |
    +-- "继续原计划" -> 恢复实现
    +-- "确认 pivot" -> 进入影响评估
                            |
                            v
                    评估影响范围:
                    - 哪些 R-ID 受影响
                    - Unit -> R-ID 映射：未关联变更 R-ID 的 Unit 保留
                    - 依赖链检查：保留的 Unit 是否间接依赖受影响 Unit
                            |
                            v
                    路由:
                    +-- 局部修订（需求仍有效，只是实现路径变了）
                    |   回到 plan 修订受影响 Unit
                    |   feasibility-reviewer 审查修订部分
                    |   恢复 code 阶段
                    |
                    +-- 重大方向变更（需求本身需要修订）
                        回到 brainstorm
                        完整 document-review
                        完整 pipeline 重启
```

### 已完成 Unit 处理

按 R-ID 追溯判断：
- Unit 关联的 R-ID 均未受影响 → 保留（已提交的代码不动）
- Unit 关联的 R-ID 受影响 → 需要重新评估
- 保留的 Unit 依赖受影响 Unit 的产出 → 也需要修订

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
| `ce-flow` | 入口 | 智能编排器，状态检测 + 意图路由 + rework/spike/pivot/增量交付协议 |
| `ce-init` | 初始化 | 为项目生成 AGENTS.md + CLAUDE.md |
| `ce-brainstorm` | brainstorm | 需求定义（grill 风格 + 术语沉淀 + learnings 检索） |
| `ce-ideate` | brainstorm | 创意发散 |
| `document-review` | brainstorm, plan | 文档多人格审查 |
| `ce-plan` | plan | 计划创建（含架构深度分析 + spike 假设标记） |
| `ce-work` | code | 执行 Implementation Units + post-cleanup + Coding Discipline + pivot 检测 |
| `ce-review` | code (autofix), review | 多角色代码审查（含 architecture-depth-reviewer） |
| `ce-debug` | bug fix | 编排器：反馈循环 -> learnings 检索 -> 根因 -> 修复 -> 验证 |
| `git-commit` | ship | 单次提交 |
| `git-commit-push-pr` | ship | 提交 + 推送 + 开 PR |
| `ce-compound` | ship (post-hook) | 知识沉淀 + 规范回流 |

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
brainstorm          plan           spike          code            review          ship
需求文档 ---------> 实施计划 ----> 假设验证 ----> 代码变更 -----> PASS/FAIL ----> PR
R1,R2,R3            Impl Units     VERIFIED/      staged diff     safe_auto fix   |
CONTEXT.md          架构深度分析   FALSIFIED                      gated 裁决      |
ADR (条件)          Spike假设                                     rework loop     |
                    Test Scenarios                                (max 3 rounds)  |
                         ^                                             |          v
                         |                              NEEDS_WORK ----+     [post-hook]
                         |                              (内联修复)            ce-compound
                         |                                                        |
                         |    pivot (需求偏差)                                     |
                         +<------------- ce-work 检测 + 用户确认                  |
                         |                                                        |
plan (ce-plan) <-- learnings 自动搜索 ------------------------------------------>+
brainstorm     <-- learnings 自动搜索 ------------------------------------------>+
ce-debug       <-- learnings 自动搜索 ------------------------------------------>+
```

R-ID 从 brainstorm 贯穿到 review。知识从 ship 回流到 plan、brainstorm、debug。领域语言从 brainstorm 贯穿到所有阶段（通过 CONTEXT.md）。Spike 验证假设在 plan 和 code 之间。Pivot 从 code 回流到 plan 或 brainstorm。Rework 在 review 和 code 之间循环。

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
| Rework 由 ce-flow 内联处理，不委托 ce-work | 短循环修复，不需要完整计划驱动执行 |
| Spike 由 ce-flow 直接处理，不建子 skill | 简单 3 步序列，子 skill 增加无价值间接层 |
| 增量交付状态在会话上下文中跟踪 | 单会话内完成，resume detection 已处理重入 |
| Rework TDD 按 autofix_class 降级 | 纯重构类 finding 不存在有意义的 RED 状态 |
| Pivot 需用户确认才执行 | Agent 可能误判，pivot 决策权在用户 |
| 已完成 Unit 按 R-ID 追溯保留 | 精确且有据可查，避免不必要的全量回滚 |
| 增量交付用 Sequential PRs | Stacked PRs 工具链不成熟，并行分支复杂度爆炸 |
