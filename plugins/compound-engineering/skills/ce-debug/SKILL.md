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

## Step 1: Build a Feedback Loop

**Goal:** A fast, deterministic, repeatable pass/fail signal for the bug. This is the most important step — with a good feedback loop, the bug is 90% fixed.

**How:** Load the `reproduce-bug` skill if the input is a GitHub issue URL. Otherwise, build the loop manually.

### Strategies (try in roughly this order)

1. **Failing test** — at whatever seam reaches the bug (unit, integration, e2e)
2. **Curl / HTTP script** — against a running dev server
3. **CLI invocation** — with a fixture input, diffing stdout against known-good output
4. **Headless browser script** — drives the UI, asserts on DOM/console/network
5. **Replay a captured trace** — save a real request/payload/event log, replay through the code path in isolation
6. **Throwaway harness** — spin up a minimal subset of the system that exercises the bug path with a single function call
7. **Property / fuzz loop** — if the bug is "sometimes wrong output", run 1000 random inputs and look for the failure mode
8. **Bisection harness** — if the bug appeared between two known states, automate `git bisect run`
9. **Differential loop** — run the same input through old-version vs new-version and diff outputs
10. **Manual-assisted script** — last resort when a human must interact; structure it so captured output feeds back for analysis

### Iterate on the loop

Once a loop exists, improve it:
- **Faster?** Cache setup, skip unrelated init, narrow test scope
- **Sharper signal?** Assert on the specific symptom, not just "didn't crash"
- **More deterministic?** Pin time, seed RNG, isolate filesystem, freeze network

A 30-second flaky loop is barely better than no loop. A 2-second deterministic loop is a debugging superpower.

### Non-deterministic bugs

The goal is a higher reproduction rate, not a clean repro. Loop the trigger 100x, parallelize, add stress, narrow timing windows, inject sleeps. A 50%-flake is debuggable; 1% is not — keep raising the rate.

**Gate:** If no feedback loop can be constructed after reasonable effort, STOP. Ask the user for: access to the reproducing environment, a captured artifact (HAR file, log dump, core dump, screen recording), or permission to add temporary instrumentation. Do not proceed without a loop.

**Output:** A repeatable pass/fail signal that reliably demonstrates the bug.

---

## Step 2: Root-Cause

**Goal:** Identify the exact code location and causal chain that produces the bug.

**Pre-step — Search institutional knowledge:**

Before loading systematic-debugging, dispatch the learnings-researcher to check for known issues in the affected area:

- Task `compound-engineering:research:learnings-researcher`(bug description + affected module/component)

If relevant learnings are found:
- Surface them: "Found a documented solution that may be related: [title]. Key insight: [insight]."
- Use the learnings to inform hypothesis generation in systematic-debugging (pass as context to narrow the search space)
- If a past solution directly matches the current symptoms, verify it applies before proceeding with full root-cause analysis

If no relevant learnings are found, proceed to systematic-debugging without delay.

**How:** Load the `systematic-debugging` skill (superpowers). It enforces:
- Hypothesis-driven investigation (not trial-and-error)
- Evidence collection before conclusions
- Falsifiable hypotheses tested one at a time

### Instrumentation discipline

When adding debug logging or instrumentation during investigation:

- **Tag every debug log** with a unique prefix: `[DEBUG-xxxx]` (4 random hex chars). Example: `console.log("[DEBUG-a4f2] order state:", order.status)`
- This makes cleanup trivial — a single grep removes all instrumentation
- Never use untagged `console.log` or `print` for debugging — they survive and pollute

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
3. **Remove all `[DEBUG-xxxx]` instrumentation** — grep for the tag prefix and delete every tagged line
4. Invoke `ce:review mode:autofix` on the changes — apply safe fixes, surface anything concerning

**Gate:** If the test suite has new failures, return to Step 3. If `ce-review` surfaces serious concerns, address them before proceeding.

**Output:** All tests pass, review clean, no debug instrumentation remaining.

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
