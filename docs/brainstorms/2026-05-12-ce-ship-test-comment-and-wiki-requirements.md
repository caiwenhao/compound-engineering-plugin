# ce-ship 测试评论 + Wiki 知识沉淀

## Summary

ce-ship 交付流程增加两个后置步骤：(1) 在关联 issue 上发布结构化人工测试说明；(2) 将知识沉淀同步写入 GitHub Wiki。两者共同形成"交付即文档"的闭环——每次 ship 自动产出可追溯的测试指南和可检索的知识条目。

## Requirements

### 测试评论

**R1** ce-ship 在 PR 合并成功后、关闭 issue 前，向每个关联 issue 发布一条结构化测试评论。评论通过 `gh issue comment` 写入。

**R2** 评论内容包含四个必要部分：前置条件（环境/数据准备）、操作步骤（分步指令）、预期结果（可观测的正确行为）、边界情况（值得额外验证的场景）。

**R3** 评论内容优先从 plan 文档的验收标准/测试场景章节提取并转化。若 plan 文档不存在或无相关章节，从 PR diff + issue 描述推断生成。

**R4** 评论使用 GitHub `<details><summary>` 折叠格式，默认收起。标题为"手动测试说明（自动生成）"。

**R5** 幂等更新：评论前通过 `gh api` 列出 issue 评论，检查是否已有包含 `<!-- ce-ship-test-instructions -->` HTML 注释标记的评论。若存在，通过 `gh api --method PATCH repos/{owner}/{repo}/issues/comments/{comment_id}` 编辑更新该评论而非新增。

**R6** 可测试性检查：生成评论前判断 PR 是否有可观测行为变化。由于 ce-ship 使用 squash merge，检查对象是 PR title 的 type 前缀（即 squash commit message 的前缀）。满足以下任一条件时跳过评论：
- PR title 的 type 前缀为 `docs:`、`refactor:`、`chore:`、`ci:`、`style:`、`test:`
- 变更文件全部位于 `docs/`、`.github/`、`*.md`（排除 SKILL.md 和 agent.md）

跳过时不输出任何提示，静默继续后续步骤。

### Wiki 知识沉淀

**R7** ce-ship 的知识沉淀步骤（当前 Step 8，由 ce-compound 执行）在写入本地 `docs/solutions/` 的同时，将同一内容同步写入 GitHub Wiki。

**R8** Wiki 写入前通过 `gh api repos/{owner}/{repo}` 检查 `has_wiki` 字段。若为 false、API 调用失败、或 Wiki 仓库未初始化（clone 失败），跳过 wiki 写入，仅保留本地写入，输出一行警告："Wiki 未启用或未初始化，知识仅写入本地 docs/solutions/"。

**R9** Wiki 写入机制：clone `{owner}/{repo}.wiki.git` 到临时目录，创建/修改文件后 commit + push。Wiki 页面命名规则：`{category}-{slug}.md`（扁平命名，用连字符分隔 category 和 slug），与 `docs/solutions/` 的目录结构逻辑对齐。例如 `docs/solutions/workflow/stale-local-base.md` 对应 Wiki 文件 `workflow-stale-local-base.md`。

**R10** 每条 Wiki 页面保留与本地文件相同的 YAML frontmatter（在页面顶部以 code block 形式呈现），确保 LLM agent 可通过 frontmatter 字段做结构化搜索。每个本地文件对应一个独立的 Wiki 页面，不做追加合并。

**R11** Wiki 写入为尽力而为（best-effort）：clone 或 push 失败时记录错误原因，继续后续步骤，不中止 ship 流程。不处理并发冲突——如果 push 因冲突失败，跳过本次 wiki 写入。

**R12** `gh` CLI 未认证或不可用时，跳过 wiki 写入和 issue 评论，将测试说明写入本地临时文件（`/tmp/ce-ship-test-instructions-{issue-id}.md`），并提示用户手动处理。

## Scope Boundaries

### In Scope
- 修改 `ce-ship/SKILL.md` 增加测试评论步骤和 wiki 写入指令
- 修改 `ce-compound/SKILL.md` 增加 wiki 双写逻辑
- 定义评论模板格式和 wiki 页面结构

### Deferred for Later
- ce-learnings-researcher 支持 wiki 搜索（Phase 2）
- Wiki 以 issue 编号为主键串联全生命周期（Phase 3）
- ce-brainstorm/ce-plan 启动时从 wiki 预热上下文（Phase 3）
- Wiki 条目过期标记机制（ce-compound-refresh 已有类似功能）

### Out of Scope
- Embedding 语义搜索
- MCP server 封装
- 跨仓库知识联邦
- Wiki 页面的人工编辑界面或管理工具

## Key Decisions

1. **评论位置：merge 后、close issue 前** — 确保 issue 关闭时已附带测试指南，且不阻塞合并流程。
2. **Plan-first 内容策略** — 优先复用 plan 文档已有的验收标准，避免 ship 阶段重新推断测试逻辑。
3. **双写而非迁移** — 本地 docs/ 保持不变（向后兼容），Wiki 是增量收益。现有 grep 搜索继续工作。
4. **每条目独立页面** — 每个本地 `docs/solutions/` 文件对应一个 Wiki 页面，不做追加合并。避免单页过大溢出 LLM 上下文窗口。
5. **静默跳过非观测变更** — 不生成"无需测试"的噪音评论，保持 issue 讨论流干净。
6. **Wiki 写入通过 git 操作** — clone `.wiki.git` + commit + push，因为 GitHub Wiki 没有 REST 写入 API。

## Implementation Constraints (from learnings)

- **显式状态检查**：每个新步骤前必须显式检查前置状态（PR 是否存在、issue 是否关联），不假设上游步骤成功。`gh pr view` 非零退出是"无 PR"的正常状态，不是错误。
- **独立降级 flag**：Wiki 可写性和 issue 评论可写性是两个独立判断，不共用一个 flag。Wiki 不可用不应抑制 issue 评论，反之亦然。
- **路由逻辑 inline**：新步骤的触发条件和执行逻辑必须内联在 SKILL.md 中，不能只放在 references 文件里（load-bearing rule）。
- **失败不中止**：Wiki 写入失败或 issue 评论失败不应中止整个 ship 流程。记录跳过原因，继续后续步骤。

## Dependencies / Assumptions

- 用户仓库已安装并认证 `gh` CLI（降级路径已覆盖）
- GitHub Wiki 通过 git clone/push 操作（`{repo}.wiki.git`），不依赖 REST API 写入端点
- Wiki 仓库需要至少有一个页面才能被 clone（首次使用需用户在 GitHub UI 初始化 Wiki）
- ce-compound 的输出格式（YAML frontmatter + Markdown body）不变
- Plan 文档中的验收标准章节命名为"验收标准"或"Acceptance Criteria"或"测试场景"

## Success Criteria

- 每次 ship 可观测变更后，关联 issue 上有且仅有一条折叠的测试评论
- 纯重构/文档变更不产生测试评论
- Wiki 启用时，`docs/solutions/` 的每个新条目在 Wiki 中有对应页面
- Wiki 未启用时，流程正常完成，无报错
- `gh` 不可用时，测试说明落地到本地文件，用户收到明确提示
