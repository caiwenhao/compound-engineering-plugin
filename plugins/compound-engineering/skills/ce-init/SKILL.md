---
name: ce-init
description: 'Initialize a project with Workflow v2 configuration. Creates AGENTS.md with iron rules and workflow commands, sets up skills/ directory with symlinks, and configures .gitignore. Use when starting work in a new project, or when the user says "init", "initialize", "set up workflow".'
argument-hint: "[blank - runs in current project directory]"
---

# Initialize Project for AI Coding Workflow v2

Set up the project with Workflow v2 configuration: AGENTS.md with iron rules and workflow commands, skills/ directory structure, and .gitignore updates.

## Execution Steps

### Step 1: Create skills/ Directory

Create an empty `skills/` directory at the repository root:

```bash
mkdir -p skills
```

This directory will hold project-specific custom skills created via `superpowers:writing-skills`.

### Step 2: Create Symlinks

Create symlinks from `.agents/skills` and `.claude/skills` to the root `skills/` directory:

```bash
mkdir -p .agents .claude
ln -sf ../skills .agents/skills
ln -sf ../skills .claude/skills
```

**Conflict handling**: If `.agents/skills` or `.claude/skills` already exists (as a file, directory, or symlink), ask the user whether to overwrite:

```
Found existing .agents/skills. Overwrite with symlink to skills/? (yes/no)
```

If the user says no, skip that symlink and continue with the rest.

### Step 3: Update .gitignore

Add `.agents/` and `.claude/` to `.gitignore` if not already present:

```bash
# Check if .gitignore exists, create if not
touch .gitignore

# Add entries if not present
grep -qxF '.agents/' .gitignore || echo '.agents/' >> .gitignore
grep -qxF '.claude/' .gitignore || echo '.claude/' >> .gitignore
```

### Step 4: Generate AGENTS.md

Write `AGENTS.md` at the repository root with the following structure. **If AGENTS.md already exists, overwrite it directly without warning.**

```markdown
# AI Coding Workflow v2 - Iron Rules

These rules are enforced throughout the development workflow. Follow them strictly.

1. **设计先于实现** -- 需求批准前不碰代码
2. **测试先于代码** -- 无失败测试不写生产代码
3. **根因先于修复** -- 不理解为什么坏就不能修
4. **证据先于断言** -- 没跑命令不能说"通过了"
5. **验证先于采纳** -- 审查反馈先验证再实现
6. **隔离推荐** -- 推荐在 feature branch/worktree 中工作，不强制
7. **提交由用户触发** -- Phase 1-4 不 commit/push/PR

---

## Workflow Commands

Use these commands as your primary workflow interface. They orchestrate the complete development lifecycle.

**Core Workflow:**
- `ce-flow` - Complete end-to-end development workflow orchestrator
- `ce-brainstorm` - Requirements definition with grill-style questioning
- `ce-plan` - Implementation planning with architecture analysis
- `ce-work` - Execute implementation units with TDD discipline
- `ce-review` - Multi-persona code review with auto-fix
- `ce-ship` - Complete delivery: commit, PR, merge, cleanup, learning capture
- `ce-debug` - Bug fix workflow: reproduce, root cause, fix, verify

**Supporting Commands:**
- `ce-compound` - Knowledge capture and pattern documentation
- `ce-ideate` - Creative ideation when direction is unclear
- `document-review` - Multi-persona document review (requirements, plans)
- `ce-commit-push-pr` - Commit, push, and create PR (called by ce-ship)

**Superpowers (Behavioral Discipline):**
- `test-driven-development` - Enforce RED-GREEN-REFACTOR cycle
- `systematic-debugging` - Root cause analysis before fixing
- `verification-before-completion` - Run commands before claiming success
- `receiving-code-review` - Validate review feedback before implementing
- `using-git-worktrees` - Isolated development in worktrees
- `simplify` - Code cleanup: reuse, quality, efficiency
- `dispatching-parallel-agents` - Parallel execution of independent tasks
- `superpowers:writing-skills` - Create custom skills in skills/ directory

---

## Quick Start

\```bash
# Install dependencies
<TODO: add your install command>

# Run tests
<TODO: add your test command>

# Start dev server
<TODO: add your dev command>

# Lint
<TODO: add your lint command>
\```

---

## Tech Stack

<TODO: Document your tech stack>

- **Language:** 
- **Framework:** 
- **Package Manager:** 
- **Test Framework:** 
- **Linter:** 

---

## Code Style

<TODO: Document your code style rules>

---

## Testing

<TODO: Document your testing conventions>

- Test files live in: 
- Naming convention: 
- Run all tests: 
- Run single test: 

---

## Architecture

<TODO: Document your architecture and directory structure>

---

## Workflow

<TODO: Document your git workflow>

- Default branch: 
- Branch naming: 
- CI: 
- PR requirements: 

---

## Constraints

<TODO: Add project-specific constraints>

<!-- Examples:
- Do not use ORM X, we use raw SQL
- Never modify the legacy/ directory
- All API changes need migration scripts
-->

---

## Working Agreement

**User decisions**: When a decision requires user input, always use the AskUserQuestion tool. Do not use text lists or numbered options waiting for a reply.
```

**Important**: The AGENTS.md template above includes:
1. Seven iron rules at the very top
2. Workflow Commands section immediately after iron rules
3. Core + supporting commands with one-line descriptions
4. Superpowers skills listed
5. Standard project documentation sections (Quick Start, Tech Stack, etc.) as TODO placeholders

### Step 5: Generate CLAUDE.md Shim

Write `CLAUDE.md` with a single line:

```markdown
@AGENTS.md
```

### Step 6: Report Success

Display a concise summary:

```
Created skills/, .agents/skills, .claude/skills, AGENTS.md, CLAUDE.md, updated .gitignore. Project initialized.
```

## Notes

- **No git repository check**: ce-init can run in any directory, git repository or not.
- **No execution confirmation**: User invoking ce-init implies consent to all operations.
- **Direct AGENTS.md overwrite**: If AGENTS.md exists, overwrite it without warning.
- **Symlink conflict handling**: Only ask user confirmation if symlink targets already exist.
- **skills/ directory**: Created empty, not added to .gitignore (should be tracked by git).
