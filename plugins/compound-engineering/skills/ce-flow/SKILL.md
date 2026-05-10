---
name: ce-flow
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

This phase is a **pre-document gate**. Run it before writing any requirements document, plan document, spike artifact, or code change.

Resolve the default branch:

```bash
git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name' 2>/dev/null || echo main
```

If on the default branch (`main`, `master`, or the resolved default branch) and the task is non-trivial, stop before creating documents and ask:

> "You're on the default branch. Before I create requirements or plan documents, choose a workspace:
> 1. Create a feature branch here
> 2. Create a worktree
> 3. Continue on the default branch"

Use the platform's blocking question tool for this decision. In Codex, use `request_user_input` when available; otherwise present the numbered list and wait for the user's reply. In Claude Code, use `AskUserQuestion` after loading its schema if needed.

Routing:
- **Feature branch:** derive a short branch name from the task, create it with `git checkout -b <branch-name>`, then re-run `git branch --show-current`.
- **Worktree:** load `ce-worktree` and create a worktree for the task. Continue the flow from the worktree checkout.
- **Continue on default branch:** require explicit user confirmation. Record that the user accepted default-branch risk, then continue.

Do not proceed to Brainstorm, Plan, or Resume Detection document writes until this gate is resolved.

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

Route to the `ce-debug` skill with the user's bug description:

```
ce-debug <user_input>
```

After `ce-debug` completes (fix verified), proceed to Ship Phase.

---

## Standard Pipeline

### Document Review Gates

Requirements and plan documents are reviewed before the workflow advances into implementation.

**Execute:** Load `ce-doc-review mode:headless <document-path>`.

**Gate:** Classify the returned findings:
- If only `safe_auto` fixes were applied, re-read the document, summarize the applied fixes, and continue.
- If `gated_auto`, `manual`, or high-impact FYI findings are returned, present them grouped by severity and ask the user which findings to accept, defer to Open Questions, or reject as intentional.
- Apply accepted findings directly to the document. Use the existing document structure; do not rewrite the artifact wholesale unless the accepted findings require it.
- Re-run `ce-doc-review mode:headless <document-path>` after edits. Continue until the review returns no blocking findings, or until 3 review rounds have completed.

**3-round escalation:** If blocking findings remain after 3 rounds, stop and present options:
1. Accept risk and continue to the next stage with remaining findings noted
2. Return to the previous stage for deeper rework
3. Stop the flow

Use the platform's blocking question tool for decisions. In Codex, use `request_user_input` when available; otherwise present a numbered list and wait for the user's reply. In Claude Code, use `AskUserQuestion` after loading its schema if needed.

---

### Stage 1: Brainstorm

**Skip conditions:**
- User explicitly says "skip brainstorm" or "I know what I want"
- A requirements document already exists and user confirms it's current
- The task is clearly trivial (single-file config change, typo fix)

**Execute:** Load the `ce-brainstorm` skill with the user's input.

**Gate:** Brainstorm produces a requirements document. Run the Document Review Gate on the requirements document before proceeding to Stage 2. Do not enter planning while blocking requirements-review findings remain unresolved unless the user explicitly accepts that risk.

**State:** Record requirements document path.

---

### Stage 1.5: Prototype (Conditional)

**Purpose:** Align on user experience before technical planning when the requirements describe a UI surface.

**Trigger:** Run this stage when the reviewed requirements document mentions user-visible frontend work, including any of:
- Pages, screens, dashboards, admin panels, forms, modals, navigation, settings, visual states, responsive behavior, or accessibility
- User flows that depend on UI interaction
- New or changed frontend components

**Skip conditions:**
- User explicitly says "skip prototype" or "no prototype"
- Requirements are backend/API/CLI/data-only
- Existing Figma/design spec is already authoritative and current
- The task is a small UI copy/style tweak where a prototype would add ceremony

**Execute:**
1. Create a prototype directory under `docs/prototypes/<yyyy-mm-dd>-<short-slug>/`.
2. Load `ce-frontend-design` with the reviewed requirements document and instruct it to produce a standalone HTML prototype at `docs/prototypes/<yyyy-mm-dd>-<short-slug>/index.html`. The prototype is a planning artifact, not production implementation.
3. Use existing design-system signals from the target repo when available. For greenfield UI, use the frontend-design workflow's visual thesis, content plan, interaction plan, and visual verification.

**Gate:** Present the prototype path and ask whether it is approved for planning:
- **Approved:** Record the prototype path and pass it into Stage 2 with the requirements document.
- **Needs changes:** Apply targeted prototype revisions, then re-present. Cap at 3 prototype rounds before asking whether to continue iterating, proceed with known gaps, or skip the prototype.
- **Rejected / wrong direction:** Return to Stage 1 with the feedback, revise requirements, then re-run requirements Document Review Gate.

**State:** Record prototype path when approved.

---

### Stage 2: Plan

**Skip conditions:**
- A plan document already exists and user confirms it's current
- The task is trivial enough that `ce-work` can handle it from a bare prompt
- User explicitly says "skip planning, just code it"

**Execute:** Load the `ce-plan` skill, passing the requirements document path as input. If Stage 1.5 produced an approved prototype, also pass the prototype path as UX context for planning.

**Gate:** Plan produces a plan document. Run the Document Review Gate on the plan document before proceeding to Stage 2.5 or Stage 3. Do not enter coding while blocking plan-review findings remain unresolved unless the user explicitly accepts that risk.

**State:** Record plan document path.

---

### Stage 2.5: Spike Validation (Conditional)

**Skip conditions:**
- Plan contains no spike assumptions
- All external dependencies already have proven usage in the codebase

**Trigger:** The plan document contains a `Spike Assumptions` section in its Risk table, OR `document-review` feasibility-reviewer flagged unverified external dependency assumptions.

**Execute:**

For each spike assumption in the plan:

1. Write minimal verification code in `.context/compound-engineering/spike/<assumption-slug>/`
2. Run the verification (import check, API call, build step, integration test — whatever proves or disproves the assumption)
3. Record result: VERIFIED or FALSIFIED

**After verification:**

- Delete the entire `.context/compound-engineering/spike/` directory
- Update the plan's Risk table with verification status for each assumption

**Failure routing:**

- FALSIFIED assumption affects a core requirement (R-ID referenced in the assumption's "Affects" column):
  > "Spike failed: [assumption]. This affects requirement [R-ID]. The requirement may need revision or an alternative approach. Recommend returning to brainstorm."
  
  Return to Stage 1 (Brainstorm) with pivot context.

- FALSIFIED assumption affects only the implementation path (Unit-level, not R-ID-level):
  > "Spike failed: [assumption]. This affects [Unit name]'s approach but not the core requirements. Revising the plan."
  
  Return to Stage 2 (Plan) for local revision of the affected Unit. After revision, run feasibility-reviewer only on the revised section, then re-enter Stage 2.5 for any new spike assumptions.

---

### Stage 3: Code

**Execute:** Load the `ce-work` skill, passing the plan document path (or requirements doc, or bare prompt if earlier stages were skipped).

`ce-work` handles:
- Implementation of all units
- Post-implementation simplification (simplify skill)
- Automated code review (`ce-review mode:autofix`) after implementation

**Gate:** `ce-work` completes all units and passes its internal quality checks.

---

### Stage 4: Review

**Execute:** Load the `ce-review` skill in interactive mode. Pass `plan:<path>` if a plan exists.

This is the full interactive review — it surfaces findings that need user judgment (gated_auto, manual items) beyond what autofix already handled in Stage 3.

**Gate:** Review returns PASS or NEEDS_WORK.

- If PASS: proceed to Stage 5.
- If NEEDS_WORK: enter the Rework Protocol below.

#### Rework Protocol

When `ce-review` returns NEEDS_WORK with a finding list:

1. **Present findings to user.** Show the finding list grouped by severity. Ask if any findings should be rejected (false positives or intentional design choices). Use the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini).

2. **Determine TDD discipline per finding:**
   - `gated_auto` + category is correctness or security → TDD forced: write a failing test that demonstrates the finding, then fix to make it pass
   - All other findings (maintainability, style, performance) → fix directly, run existing test suite after all fixes applied

3. **Fix findings inline.** Fix each accepted finding in the current checkout. Do not delegate to `ce-work` — this is a targeted fix loop, not plan-driven implementation.

4. **Re-review.** Invoke `ce-review` again on the updated diff. Increment round counter.

5. **3-round escalation.** If NEEDS_WORK persists after 3 rounds, stop and present options:

   > "Review has not converged after 3 rounds. Remaining findings: [list]. Options:"
   > 1. Accept risk — merge with remaining findings documented in PR description
   > 2. Split PR — ship completed Units independently (enters Incremental Delivery Path)
   > 3. Abandon — discard changes, do not commit

   Use the platform's blocking question tool for this decision.

   - Accept risk: proceed to Stage 5 with findings noted in PR body as "Known Issues"
   - Split PR: enter Incremental Delivery Path (see below)
   - Abandon: stop, inform user, do not commit

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

**Execute:** Load the `ce-ship` skill to run final checks, commit, push, open or update a PR, and evaluate learning capture.

**Post-ship:** Automatically load the `ce-compound` skill to evaluate whether this work produced knowledge worth documenting. The skill internally decides whether to record anything or skip.

---

### Incremental Delivery Path

**Activation criteria** (any of):
- Plan has independent Implementation Units (no dependency chain between them) AND total expected diff >300 lines — detected at Stage 3 entry
- User chose "Split PR" from the 3-round rework escalation in Stage 4

**Default:** Single PR for all Units. Incremental delivery is the exception.

**Mechanism — Sequential PRs:**

When activated, execute each independent Unit (or Unit group) through the full pipeline:

1. Code — load `ce-work` with single Unit scope
2. Review — load `ce-review` in interactive mode
3. Ship — load `ce-ship` to run final checks, commit, push, and open or update a PR
4. Sync — pull fresh main before starting next Unit

**Ordering:** Ship Units with no unshipped dependencies first. If all remaining Units depend on unshipped Units, ship in dependency order.

**State tracking:** Maintain in conversation context:
- `shipped_units: [Unit 1, Unit 3]`
- `remaining_units: [Unit 2, Unit 4]`

If the session breaks mid-delivery, resume detection (Phase 3) reconstructs state from git history — merged PRs on main that reference the plan document.

**Post-ship hook:** Run `ce-compound` once after the final Unit ships (not after each Unit).

---

### Pivot Protocol

Can be triggered from Stage 3 (Code) when `ce-work` reports a requirements mismatch.

**Detection:** `ce-work` emits a pivot signal when implementation contradicts a requirement (R-ID), a plan assumption proves false, or changes would violate scope boundaries. ce-flow receives this signal and handles routing.

**When pivot signal received:**

1. **Present to user:**
   > "ce-work detected a mismatch: [explanation]. This may indicate the requirements or plan need revision. Confirm pivot, or continue as planned?"

   Use the platform's blocking question tool.

2. **If user says "continue as planned":** Resume Stage 3 (false alarm).

3. **If user confirms pivot:**

   a. **Assess impact:**
      - Identify which R-IDs are affected
      - Check Unit → R-ID mapping in the plan: Units linked only to unaffected R-IDs are preserved
      - Check dependency chain: if a preserved Unit depends on an affected Unit's output, it must also be revised

   b. **Route by scope:**
   
   - **Local revision** (requirements still valid, only implementation path changes):
     - Return to Stage 2 (Plan) for targeted revision of affected Units
     - Run feasibility-reviewer only on revised sections
     - Resume from Stage 2.5 (spike if new assumptions) or Stage 3 (code)
   
   - **Major direction change** (requirements themselves need revision):
     - Return to Stage 1 (Brainstorm) with pivot context
     - Full document-review after brainstorm revision
     - Full pipeline restart from revised requirements

   c. **Preserved work:** Completed Units whose R-IDs are unaffected remain committed. Only affected Units are reworked.

---

## Gate Strategy

| Situation | Behavior |
|-----------|----------|
| Current stage passes, next step is clear | Advance automatically |
| Multiple valid paths, user preference needed | Stop, present options |
| Hard blocker (test failure, merge conflict, missing context) | Stop, explain the blocker |
| Review is complete but the user has not asked to ship | Stop at the review result and wait for the user's ship instruction |

---

## Stage Skip Rules

| Condition | Skip |
|-----------|------|
| Bug fix intent detected | Skip brainstorm + plan, use Bug Fix Fast Path |
| Requirements doc exists and confirmed | Skip brainstorm |
| Plan doc exists and confirmed | Skip plan |
| Requirements doc exists but has not been reviewed in this flow | Run requirements Document Review Gate before planning |
| Reviewed requirements describe UI work and no approved prototype exists | Run Prototype stage before planning |
| Plan doc exists but has not been reviewed in this flow | Run plan Document Review Gate before coding |
| Trivial change (typo, config, single-line) | Skip brainstorm + plan, go direct to code |
| User explicitly requests a specific stage | Jump to that stage |

---

## Seven Principles

1. **Design before implementation** — no code without approved requirements
2. **Tests before code** — no production code without a failing test (when behavioral)
3. **Root cause before fix** — no fix without understanding why it's broken
4. **Evidence before assertion** — no "it works" without running the command
5. **Verify before adopting** — review feedback is verified, not blindly applied
6. **Workspace isolation gated before documents** — feature branch or worktree before requirements/plan writes unless the user explicitly accepts default-branch risk
7. **Ship is user-triggered** — flow stops at review until the user explicitly asks to ship
