---
name: ce-ship
description: Ship completed work by running final checks, committing, pushing, opening or updating a PR, merging it, closing related issues, cleaning up branches/worktrees, and capturing learnings. Use when the user says "ship", "ship this", "finish and PR", "open the PR after review", or wants the standalone Ship stage from ce-flow.
argument-hint: "[optional shipping context, PR focus, or blank for current branch]"
---

# Ship

Standalone Ship stage for the compound-engineering workflow.

Use this when code work and review are done and the user wants to complete the full delivery: from current branch to merged PR with cleanup. This skill orchestrates the entire shipping pipeline: final checks, commit/push/PR creation, merge, issue closure, workspace cleanup, and learning capture.

## Input

<shipping_context> #$ARGUMENTS </shipping_context>

## Authorization Model

An explicit `ce-ship` invocation is a single authorization to run the normal shipping pipeline end to end: commit, push, open or update the PR, merge it, close related issues, clean up the feature branch or worktree, sync the default branch, and evaluate learning capture. Do not ask separate confirmation questions for those expected shipping steps.

This authorization does not override stop conditions. Stop when verification fails, rebase conflicts occur, required credentials or remotes are unavailable, PR merge fails, or the current checkout is the default branch. Also stop before any action outside the documented shipping pipeline or any destructive action unrelated to the shipped branch/worktree.

## Workflow

### Step 1: Pre-ship State Check

Gather context:

```bash
git branch --show-current
git status --short
git log --oneline -5
gh pr view --json url,title,state 2>/dev/null || true
```

If on `main`, `master`, or the resolved default branch, stop and explain that shipping requires a feature branch. Do not push directly from the default branch.

If the working tree is clean and there are no unpushed commits and no open PR, report that there is nothing to ship.

### Step 2: Final Verification

Run the relevant verification command for the current repo when it is clear from project instructions or package scripts. For this repo, use:

```bash
bun test
```

If the correct verification command is not clear, inspect project scripts or existing instructions, choose the narrowest meaningful test command, and report what was run.

If verification fails, stop and summarize the failure. Do not commit, push, or open a PR until the failure is addressed or the user explicitly accepts the risk.

### Step 3: Sync Check

Check whether the branch is behind the remote default branch:

```bash
git fetch origin main
git merge-base --is-ancestor origin/main HEAD
```

If behind, rebase:

```bash
git rebase origin/main
```

If conflicts arise, stop and help the user resolve them before continuing.

If the repository's default branch is not `main`, substitute the detected default branch.

### Step 4: Commit, Push, and PR

If the current branch matches `issue-{id}-*` pattern (where `{id}` is numeric), extract the issue number. If the branch name does not match or the ID is non-numeric, skip issue extraction silently — the PR body will not include an auto-close reference. Pass the extracted issue number as shipping context to `ce-commit-push-pr` so the PR body includes `Closes #{id}` to auto-close the issue on merge.

Load `ce-commit-push-pr` in ship-orchestrated mode with the shipping context. It owns:

- Commit convention detection
- File-level logical commit grouping
- Branch safety checks
- Push
- New PR creation or existing PR update
- PR title/body generation
- Optional evidence capture via `ce-demo-reel`

Do not duplicate that logic here. Because `ce-ship` already carries end-to-end authorization, tell `ce-commit-push-pr` that it must not ask for separate confirmation before committing, pushing, creating/updating the PR, or applying the PR title/body. If it needs evidence and no evidence was explicitly requested, it should infer from the diff and proceed without blocking the ship flow.

### Step 5: Merge PR

Attempt to merge the PR immediately using squash merge:

```bash
gh pr merge --squash --auto=false
```

**On success:** Continue to Step 5.5.

**On failure:** Stop and provide detailed error report including:
- The raw error output from `gh pr merge`
- Possible causes (CI not passing, missing required approvals, branch protection rules, merge conflicts)
- Suggested next steps for the user

Do not retry or wait for conditions to change. The user must resolve blockers manually.

### Step 5.5: Test Instructions Comment

After successful merge, post a structured manual testing comment on each related issue. This step is best-effort — failure does not block subsequent steps.

**Pre-flight:** Verify `gh` CLI is authenticated:

```bash
gh auth status
```

If `gh` is unavailable or not authenticated, generate the test instructions content (see below), write it to `/tmp/ce-ship-test-instructions-{issue-id}.md`, inform the user of the file path, and skip to Step 6.

**Testability check:** Determine whether the PR has observable behavior changes. Skip this step silently (proceed to Step 6) if either condition is true:
- The PR title type prefix is one of: `docs:`, `refactor:`, `chore:`, `ci:`, `style:`, `test:`
- All changed files are in `docs/`, `.github/`, or are `*.md` files (excluding files named `SKILL.md` or ending in `.agent.md`)

**Generate test instructions:**

Produce a structured test guide with four sections:
1. **前置条件** — environment setup, data prerequisites, required services
2. **操作步骤** — step-by-step actions to verify the change
3. **预期结果** — observable correct behavior after each step
4. **边界情况** — edge cases worth additional verification

Content source priority:
1. If a plan document exists for this work (check `docs/plans/` for a file matching the branch name or issue number), extract test scenarios from its Implementation Units' `Test scenarios` and `Verification` fields
2. Otherwise, infer test steps from the PR diff and issue description

**Idempotent update:** Before posting, check for an existing comment with the marker:

```bash
EXISTING_COMMENT_ID=$(gh api "repos/{owner}/{repo}/issues/{issue-number}/comments" --jq '.[] | select(.body | contains("<!-- ce-ship-test-instructions -->")) | .id')
```

**Post or update the comment:**

If `EXISTING_COMMENT_ID` is non-empty, update the existing comment:

```bash
gh api --method PATCH "repos/{owner}/{repo}/issues/comments/$EXISTING_COMMENT_ID" -f body="$COMMENT_BODY"
```

Otherwise, create a new comment:

```bash
gh issue comment {issue-number} --body "$COMMENT_BODY"
```

**Comment format:**

```markdown
<!-- ce-ship-test-instructions -->
<details>
<summary>手动测试说明（自动生成）</summary>

## 前置条件

{preconditions}

## 操作步骤

{steps}

## 预期结果

{expected results}

## 边界情况

{edge cases}

</details>
```

If the comment post or update fails, log the error and continue to Step 6. Do not retry.

### Step 6: Close Related Issues

Extract issue references from the PR description that was created in Step 4. Look for patterns like:
- `Closes #123`
- `Fixes #456`
- `Resolves #789`

For each referenced issue, close it:

```bash
gh issue close <issue-number>
```

If issue closure fails, log the error but continue to Step 7. Issue closure is not critical enough to block cleanup.

### Step 7: Cleanup Workspace

Detect the current workspace type and clean up appropriately.

**Detect worktree:**

```bash
git rev-parse --git-common-dir
```

If the output ends with `.git/worktrees/<name>`, the current directory is a worktree.

**If in a worktree:**

1. Get the worktree path and main repo path:
   ```bash
   WORKTREE_PATH=$(git rev-parse --show-toplevel)
   COMMON_DIR=$(git rev-parse --git-common-dir)
   MAIN_REPO=$(dirname "$COMMON_DIR")
   ```

2. Switch to the main repo:
   ```bash
   cd "$MAIN_REPO"
   ```

3. Remove the worktree:
   ```bash
   git worktree remove "$WORKTREE_PATH"
   ```

4. Continue to main sync below.

**If on a feature branch (not worktree):**

1. Get the current branch name:
   ```bash
   FEATURE_BRANCH=$(git branch --show-current)
   ```

2. Switch to main:
   ```bash
   git checkout main
   ```

3. Delete the local feature branch:
   ```bash
   git branch -D "$FEATURE_BRANCH"
   ```

4. Delete the remote feature branch:
   ```bash
   git push origin --delete "$FEATURE_BRANCH"
   ```

**Sync main:**

After cleanup, ensure local main is up to date:

```bash
git pull
```

If any cleanup step fails, report the error with details but do not attempt to roll back previous steps (merge, issue closure). The user can manually clean up remaining artifacts.

### Step 8: Learning Capture

After successful merge and cleanup, load `ce-compound` to evaluate whether this work produced knowledge worth documenting. The skill decides whether to record anything or skip.

## Stop Conditions

Stop before shipping if:

- The branch is the default branch
- Verification fails
- Rebase conflicts occur
- Required credentials or remotes are unavailable

Stop after PR creation if:

- PR merge fails (CI not passing, missing approvals, merge conflicts, insufficient permissions)
  - Provide detailed error report with raw output, possible causes, and suggested next steps
  - Do not retry or wait for conditions to change

Continue despite non-critical failures:

- Issue closure fails (log error but continue to cleanup)
- Cleanup steps fail (report error but do not roll back merge or issue closure)
