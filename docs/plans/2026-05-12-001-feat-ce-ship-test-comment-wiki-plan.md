---
title: "feat: ce-ship 增加测试评论和 Wiki 知识沉淀"
status: active
origin: docs/brainstorms/2026-05-12-ce-ship-test-comment-and-wiki-requirements.md
created: 2026-05-12
---

# feat: ce-ship 增加测试评论和 Wiki 知识沉淀

## Problem Frame

ce-ship 交付后，关联 issue 缺少可操作的人工测试指南，验证知识留在开发者脑中。同时，知识沉淀仅写入本地 `docs/solutions/`，人类浏览不便，跨项目不可复用。

本计划为 ce-ship 增加两个后置步骤：(1) 结构化测试评论写入 issue；(2) ce-compound 产出同步写入 GitHub Wiki。两者独立降级，互不阻塞。

(see origin: `docs/brainstorms/2026-05-12-ce-ship-test-comment-and-wiki-requirements.md`)

---

## Scope Boundaries

### In Scope
- 修改 `plugins/compound-engineering/skills/ce-ship/SKILL.md`
- 修改 `plugins/compound-engineering/skills/ce-compound/SKILL.md`

### Deferred to Follow-Up Work
- ce-learnings-researcher 支持 wiki 搜索
- Wiki 以 issue 编号为主键串联全生命周期
- ce-brainstorm/ce-plan 启动时从 wiki 预热上下文

---

## Key Technical Decisions

1. **测试评论步骤位置：Step 5 和 Step 6 之间（新 Step 5.5）** — merge 成功后、close issue 前。确保 issue 关闭时已附带测试指南。

2. **评论内容生成策略：Plan-first + diff fallback** — agent 先尝试读取 plan 文档中的验收标准章节，若不存在则从 PR diff + issue 描述推断。不引入额外脚本，直接作为 SKILL.md 中的 agent 指令。

3. **幂等更新通过 `gh api`** — 列出评论 → 查找标记 → PATCH 更新。不使用 `gh issue comment --edit-last`（无法定位特定评论）。

4. **Wiki 双写放在 ce-compound Phase 2 步骤 7 之后** — 本地文件写入成功后再尝试 wiki。wiki 失败不影响本地写入的成功状态。

5. **Wiki 写入通过 git clone/push** — clone `{repo}.wiki.git` 到 `/tmp/ce-wiki-sync-{run-id}/`，创建文件，commit + push。不依赖不存在的 REST API。

6. **扁平页面命名** — `{category}-{slug}.md`，避免 GitHub Wiki 对子目录支持的不一致行为。

---

## Implementation Units

### U1. ce-ship 增加 Step 5.5: 测试评论

**Goal:** PR 合并后向关联 issue 发布结构化测试评论。

**Requirements:** R1, R2, R3, R4, R5, R6

**Dependencies:** 无（独立于 U2）

**Files:**
- `plugins/compound-engineering/skills/ce-ship/SKILL.md` (modify)

**Approach:**

在现有 Step 5 (Merge PR) 的 `**On success:**` 之后、Step 6 (Close Related Issues) 之前，插入新的 Step 5.5。步骤逻辑全部 inline 在 SKILL.md 中（load-bearing rule）。

Step 5.5 的流程：
1. 前置检查：`gh auth status` 确认 gh 可用，不可用则跳过并写本地文件
2. 可测试性检查：从 Step 4 的 PR title 提取 type 前缀，判断是否跳过
3. 内容生成：指示 agent 读取 plan 文档验收标准，或从 diff 推断
4. 幂等检查：`gh api` 列出 issue 评论，查找 HTML 标记
5. 写入或更新：`gh issue comment` 新增，或 `gh api --method PATCH` 更新

评论模板格式（写在 SKILL.md 中）：
```
<!-- ce-ship-test-instructions -->
<details>
<summary>手动测试说明（自动生成）</summary>

## 前置条件
...

## 操作步骤
...

## 预期结果
...

## 边界情况
...

</details>
```

**Patterns to follow:** 现有 Step 6 的 "If issue closure fails, log the error but continue" 模式。现有 Step 4 的 issue 编号提取逻辑（`issue-{id}-*` 分支名匹配）。

**Test scenarios:**
- 可观测变更（`feat:` PR）→ issue 收到折叠的测试评论
- 非观测变更（`refactor:` PR）→ 无评论产生
- 已有标记评论 → 编辑更新而非新增
- `gh` 不可用 → 测试说明写入 `/tmp/` 并提示用户
- 无关联 issue（PR 无 `Closes #` 引用）→ 跳过评论步骤

**Verification:** ship 一个 `feat:` 类型的 PR 后，关联 issue 上出现折叠的测试评论；再次 ship 同一 issue 时评论被更新而非重复。

---

### U2. ce-compound 增加 Wiki 双写

**Goal:** ce-compound 写入本地 `docs/solutions/` 后，同步写入 GitHub Wiki。

**Requirements:** R7, R8, R9, R10, R11

**Dependencies:** 无（独立于 U1）

**Files:**
- `plugins/compound-engineering/skills/ce-compound/SKILL.md` (modify)

**Approach:**

在 ce-compound Phase 2 步骤 7（Write the file）之后，插入新的步骤 7.5: Wiki Sync。逻辑 inline 在 SKILL.md 中。

步骤 7.5 的流程：
1. 检查 wiki 可用性：`gh api repos/{owner}/{repo}` → 检查 `has_wiki` 字段
2. 若 `has_wiki: false` 或 API 失败 → 输出警告，跳过
3. Clone wiki：`git clone https://github.com/{owner}/{repo}.wiki.git /tmp/ce-wiki-sync-{run-id}/`
4. 若 clone 失败（wiki 未初始化）→ 输出警告，跳过
5. 创建文件：将本地 `docs/solutions/{category}/{slug}.md` 的内容复制为 wiki 中的 `{category}-{slug}.md`
6. Commit + push：`git add . && git commit -m "sync: {slug}" && git push`
7. 若 push 失败（冲突等）→ 记录错误，跳过
8. 清理临时目录

Wiki 页面内容格式：与本地文件完全相同（包含 YAML frontmatter），确保 LLM agent 可通过 frontmatter 做结构化搜索。

**Patterns to follow:** ce-compound 现有的 "Do not declare success while validation fails" 模式（步骤 8 的 frontmatter 验证）。ce-ship 的 "Continue despite non-critical failures" 模式。

**Test scenarios:**
- Wiki 启用且已初始化 → 本地文件和 wiki 页面同时存在，内容一致
- `has_wiki: false` → 仅本地写入，输出一行警告
- Wiki 未初始化（clone 失败）→ 仅本地写入，输出警告
- Push 冲突 → 记录错误，本地写入不受影响
- `gh` 不可用 → 跳过 wiki 检查，仅本地写入

**Verification:** 在启用 wiki 的仓库中运行 ce-compound 后，GitHub Wiki 页面列表中出现对应的 `{category}-{slug}` 页面，内容与本地文件一致。

---

### U3. ce-ship Step 5.5 与 R12 降级路径整合

**Goal:** 确保 `gh` 完全不可用时，测试评论和 wiki 写入都有明确的降级行为。

**Requirements:** R12

**Dependencies:** U1

**Files:**
- `plugins/compound-engineering/skills/ce-ship/SKILL.md` (modify — 在 Step 5.5 开头增加 gh 可用性检查)

**Approach:**

在 Step 5.5 最开头增加 `gh auth status` 检查。若失败：
- 仍然生成测试评论内容（从 plan/diff 推断）
- 写入 `/tmp/ce-ship-test-instructions-{issue-id}.md`
- 输出提示："gh 未认证，测试说明已写入 {path}，请手动粘贴到 issue"
- 跳过后续的 issue 评论和 wiki 写入步骤

这个检查与 U2 的 wiki 检查独立——即使 gh 可用但 wiki 不可用，issue 评论仍然正常工作。

**Patterns to follow:** ce-flow Stage 1.1 的 `gh auth status` 前置检查模式。

**Test scenarios:**
- `gh` 未认证 → 测试说明写入本地文件，用户收到路径提示
- `gh` 可用但 wiki 不可用 → issue 评论正常，wiki 跳过

**Verification:** 在未认证 `gh` 的环境中运行 ce-ship，确认流程不中断且本地文件包含完整测试说明。

---

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Wiki clone 耗时过长（大型 wiki 历史） | Low | 使用 `--depth 1` shallow clone |
| 评论内容质量不稳定（LLM 推断） | Medium | Plan-first 策略减少推断场景；评论标注"自动生成" |
| GHES 环境 wiki git URL 格式不同 | Low | 从 `gh api` 返回的 repo URL 派生 wiki URL |

---

## Sequencing

U1 和 U2 完全独立，可并行实施。U3 依赖 U1 完成后在其基础上增加降级逻辑。

推荐顺序：U1 → U3 → U2（先完成测试评论的完整路径，再做 wiki 双写）。

---

## Deferred Implementation Notes

- Wiki clone 的具体 URL 格式（`https://` vs `git@`）取决于用户的 git 认证方式，实现时需从 `gh api` 返回的 `clone_url` 字段派生
- 评论内容的具体 LLM prompt 措辞在实现时根据实际效果调整
- ce-compound 的 lightweight mode 是否也触发 wiki 写入，留待实现时决定
