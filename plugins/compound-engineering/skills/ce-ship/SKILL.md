---
name: ce-ship
description: Ship completed work by running final checks, then committing, pushing, opening or updating a PR, and evaluating whether to capture a learning. Use when the user says "ship", "ship this", "finish and PR", "open the PR after review", or wants the standalone Ship stage from ce-flow.
argument-hint: "[optional shipping context, PR focus, or blank for current branch]"
---

# Ship

Standalone Ship stage for the compound-engineering workflow.

Use this when code work and review are done and the user wants to move from the current branch to a committed, pushed PR. This skill is a thin orchestration layer: it performs final safety checks, then delegates commit/push/PR mechanics to `ce-commit-push-pr` and learning capture to `ce-compound`.

## Input

<shipping_context> #$ARGUMENTS </shipping_context>

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

Load `ce-commit-push-pr` with the shipping context. It owns:

- Commit convention detection
- File-level logical commit grouping
- Branch safety checks
- Push
- New PR creation or existing PR update
- PR title/body generation
- Optional evidence capture via `ce-demo-reel`

Do not duplicate that logic here.

### Step 5: Learning Capture

After `ce-commit-push-pr` completes successfully, load `ce-compound` to evaluate whether this work produced knowledge worth documenting. The skill decides whether to record anything or skip.

## Stop Conditions

Stop before shipping if:

- The branch is the default branch
- Verification fails
- Rebase conflicts occur
- Required credentials or remotes are unavailable
- The user declines any required confirmation from `ce-commit-push-pr`

