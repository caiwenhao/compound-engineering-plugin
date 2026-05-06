---
name: ce:flow
description: 'Intelligent workflow orchestrator. Single entry point that detects current state, classifies intent, and routes to the correct phase (brainstorm -> plan -> code -> review -> ship). Also handles bug fix fast path. Use when starting any development task, resuming interrupted work, or when unsure which phase to enter.'
argument-hint: "[feature description, bug report, or blank to auto-detect]"
---

# Flow — Intelligent Workflow Orchestrator

Single entry point for the compound-engineering development workflow. Detects current state, classifies user intent, and routes to the correct phase — advancing automatically when the path is clear, stopping when a decision is needed.

## Input

<user_input> #$ARGUMENTS </user_input>

## Core Behavior

```
Detect state -> Classify intent -> Route to phase -> Advance or stop
```

**Principle:** Advance automatically when the next step is unambiguous. Stop and present options when a decision is needed.

---

## Phase 0: State Detection

Gather context to determine where we are:

```bash
git branch --show-current
git status --short
git log --oneline -5
```

Then scan for existing artifacts:

- Check `docs/brainstorms/` for requirements documents
- Check `docs/plans/` for plan documents
- Check for uncommitted code changes (git diff)
- Check for open PRs on current branch (`gh pr view` if available)

---

## Phase 1: Workspace Check

If on the default branch (main/master) and the task is non-trivial:

> "You're on the default branch. I'd recommend creating a feature branch or worktree for this work. Want me to set one up, or continue here?"

Proceed on user's choice. Do not block on this.

---

## Phase 2: Intent Classification

Classify the user's input into one of these intents:

| Intent | Signals | Route |
|--------|---------|-------|
| **Bug fix** | Describes unexpected behavior, references errors/crashes/exceptions, "it should X but does Y", includes stack traces, references a bug issue | -> Bug Fix Fast Path |
| **New feature / improvement** | Describes desired new behavior, "add X", "build Y", "I want to..." | -> Standard Pipeline |
| **Resume interrupted work** | No input provided, existing artifacts found on current branch | -> Resume Detection |
| **Specific phase request** | Explicitly mentions brainstorm/plan/code/review/ship | -> Requested Phase |

Do not use keyword matching for intent classification. Use natural language understanding to assess whether the user is describing a broken behavior vs. a desired new behavior. Signals for bug fix: error messages, "should X but does Y", stack traces, "broken", "crash", references to issues. Signals against: "add", "build", "create", "improve", "I want".

---

## Phase 3: Resume Detection

When no input is provided or input is vague, check for existing work on the current branch:

1. Scan `docs/brainstorms/` and `docs/plans/` for documents created on this branch (verify via `git log --diff-filter=A --name-only`)
2. Check `git diff --stat` for uncommitted changes
3. Check `gh pr view` for existing PR

If artifacts are found, present them to the user:

> "I found existing work on this branch:
> - Requirements doc: `docs/brainstorms/2026-05-01-feature-x.md`
> - Plan: `docs/plans/2026-05-01-001-feature-x-plan.md`
> - Uncommitted changes in 3 files
>
> Want to continue from where this left off?"

Wait for confirmation before proceeding. Do not silently assume these artifacts are relevant.

---

## Bug Fix Fast Path

Route to the `ce:debug` skill with the user's bug description:

```
ce:debug <user_input>
```

After `ce:debug` completes (fix verified), proceed to Ship Phase.

---

## Standard Pipeline

### Stage 1: Brainstorm

**Skip conditions:**
- User explicitly says "skip brainstorm" or "I know what I want"
- A requirements document already exists and user confirms it's current
- The task is clearly trivial (single-file config change, typo fix)

**Execute:** Load the `ce:brainstorm` skill with the user's input.

**Gate:** Brainstorm produces a requirements document. Confirm its path and proceed.

**State:** Record requirements document path.

---

### Stage 2: Plan

**Skip conditions:**
- A plan document already exists and user confirms it's current
- The task is trivial enough that `ce:work` can handle it from a bare prompt
- User explicitly says "skip planning, just code it"

**Execute:** Load the `ce:plan` skill, passing the requirements document path as input.

**Gate:** Plan produces a plan document. Confirm its path and proceed.

**State:** Record plan document path.

---

### Stage 3: Code

**Execute:** Load the `ce:work` skill, passing the plan document path (or requirements doc, or bare prompt if earlier stages were skipped).

`ce-work` handles:
- Implementation of all units
- Post-implementation simplification (simplify skill)
- Automated code review (ce:review mode:autofix)

**Gate:** `ce-work` completes all units and passes its internal quality checks.

---

### Stage 4: Review

**Execute:** Load the `ce:review` skill in interactive mode. Pass `plan:<path>` if a plan exists.

This is the full interactive review — it surfaces findings that need user judgment (gated_auto, manual items) beyond what autofix already handled in Stage 3.

**Gate:** Review returns PASS. If NEEDS_WORK, address findings and re-review (max 3 rounds).

---

### Stage 5: Ship

**Pre-ship checks:**

1. Verify all tests pass
2. Check if branch is behind origin/main:
   ```bash
   git fetch origin main
   git merge-base --is-ancestor origin/main HEAD
   ```
   If behind (exit code non-zero), rebase:
   ```bash
   git rebase origin/main
   ```
   If conflicts arise, stop and help the user resolve them before continuing.

**Execute:** Load the `git-commit-push-pr` skill to commit, push, and open a PR.

**Post-ship:** Automatically load the `ce:compound` skill to evaluate whether this work produced knowledge worth documenting. The skill internally decides whether to record anything or skip.

---

## Gate Strategy

| Situation | Behavior |
|-----------|----------|
| Current stage passes, next step is clear | Advance automatically |
| Multiple valid paths, user preference needed | Stop, present options |
| Hard blocker (test failure, merge conflict, missing context) | Stop, explain the blocker |
| About to ship (commit/push/PR) | Stop, request explicit authorization |

---

## Stage Skip Rules

| Condition | Skip |
|-----------|------|
| Bug fix intent detected | Skip brainstorm + plan, use Bug Fix Fast Path |
| Requirements doc exists and confirmed | Skip brainstorm |
| Plan doc exists and confirmed | Skip plan |
| Trivial change (typo, config, single-line) | Skip brainstorm + plan, go direct to code |
| User explicitly requests a specific stage | Jump to that stage |

---

## Seven Principles

1. **Design before implementation** — no code without approved requirements
2. **Tests before code** — no production code without a failing test (when behavioral)
3. **Root cause before fix** — no fix without understanding why it's broken
4. **Evidence before assertion** — no "it works" without running the command
5. **Verify before adopting** — review feedback is verified, not blindly applied
6. **Workspace isolation recommended** — feature branches at minimum
7. **Ship is user-triggered** — flow does not commit/push without explicit authorization
