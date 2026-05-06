---
name: ce:debug
description: 'Bug fix orchestrator: reproduce, root-cause, fix, verify. Use when the user reports a bug, describes unexpected behavior, references an error or crash, or says "debug this", "fix this bug", "why is this broken". Routes through reproduce-bug, systematic-debugging, ce-work, and ce-review in sequence.'
argument-hint: "[bug description, error message, or GitHub issue URL]"
---

# Bug Fix Orchestrator

A structured pipeline for fixing bugs with discipline: reproduce first, find root cause, then fix minimally.

Core principle: **root cause before fix.** No guessing, no "try this and see."

## Input

<bug_report> #$ARGUMENTS </bug_report>

## Pipeline

```
Signal 0: Workspace check
    |
Step 1: Reproduce (reproduce-bug)
    |
Step 2: Root-cause (systematic-debugging)
    |
Step 3: Fix (ce-work, TDD: RED -> GREEN)
    |
Step 4: Verify (ce-review mode:autofix)
    |
-> Ship (user-triggered)
```

---

## Signal 0: Workspace Check

Check the current branch:

```bash
git branch --show-current
```

If on the default branch, recommend creating a feature branch (e.g., `fix/<short-description>`). Do not force a worktree — suggest it as an option but proceed on user's choice.

---

## Step 1: Reproduce

**Goal:** A stable, repeatable reproduction of the bug with a failing assertion.

**How:** Load the `reproduce-bug` skill if the input is a GitHub issue URL. Otherwise, reproduce manually:

1. Parse the bug report for: expected behavior, actual behavior, steps to trigger, error messages, stack traces
2. Identify the minimal reproduction path
3. Write a failing test (or run a command) that demonstrates the bug
4. Confirm the failure is stable (run it twice)

**Gate:** If reproduction fails after reasonable effort, STOP. Ask the user for more context — environment details, exact steps, sample data. Do not proceed to root-cause without a confirmed reproduction.

**Output:** A failing test or reproducible command that reliably triggers the bug.

---

## Step 2: Root-Cause

**Goal:** Identify the exact code location and causal chain that produces the bug.

**How:** Load the `systematic-debugging` skill (superpowers). It enforces:
- Hypothesis-driven investigation (not trial-and-error)
- Evidence collection before conclusions
- Falsifiable hypotheses tested one at a time

Trust the skill's internal loop and stopping conditions. If it returns without a root cause (unable to locate), STOP and report findings to the user — do not attempt a fix without understanding the cause.

**Output:** Identified root cause — specific code location + explanation of why it produces the observed behavior.

---

## Step 3: Fix

**Goal:** Minimal fix that addresses the root cause without expanding scope.

**Approach — TDD RED -> GREEN:**

1. The failing test from Step 1 is the RED state (it already exists)
2. Write the minimal code change to make it GREEN
3. Do not refactor, do not clean up adjacent code, do not add features

**Constraints:**
- Fix only what the root cause analysis identified
- Do not "fix" other things noticed along the way (note them for later if important)
- If the fix requires touching more than ~3 files or involves architectural changes, STOP and inform the user — this may not be a simple bug fix

**Output:** Code change that makes the failing test pass.

---

## Step 4: Verify

**Goal:** Confirm the fix works and introduces no regressions.

**Actions:**

1. Run the reproduction test — must pass
2. Run the full test suite — no new failures
3. Invoke `ce:review mode:autofix` on the changes — apply safe fixes, surface anything concerning

**Gate:** If the test suite has new failures, return to Step 3. If `ce-review` surfaces serious concerns, address them before proceeding.

**Output:** All tests pass, review clean.

---

## After Verification

Report to the user:
- What the bug was (root cause, one sentence)
- What was fixed (the change, one sentence)
- Test coverage added

Do NOT commit or push. The user decides when to ship. If they want to proceed, they can invoke `git-commit-push-pr` or ask to ship.

---

## Constraints

- Never skip Step 1 (reproduce). A fix without reproduction proof is a guess.
- Never skip Step 2 (root-cause). A fix without understanding is a patch that may break later.
- Do not expand scope. Bug fixes are surgical. Adjacent improvements go in separate work.
- Trust sub-skill internal mechanisms. Do not override `systematic-debugging`'s loop or stopping conditions.
