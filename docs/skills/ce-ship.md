# `ce-ship`

`ce-ship` is the standalone Ship stage from `/ce-flow`. It runs final checks, verifies branch safety, then hands off to `/ce-commit-push-pr` for commit, push, and PR creation or update. After a successful PR handoff, it invokes `/ce-compound` so useful learnings can be captured.

Use `/ce-ship` when the work is already implemented and reviewed, and you want the final shipping sequence without running the whole flow again.

## Relationship

- `/ce-commit` creates local commits only.
- `/ce-commit-push-pr` handles commit, push, and PR mechanics.
- `/ce-ship` wraps the final workflow stage: checks first, then `/ce-commit-push-pr`, then `/ce-compound`.
- `/ce-flow` uses `/ce-ship` for Stage 5.

## Typical Use

```text
/ce-ship
```

Optional context can steer the PR description:

```text
/ce-ship include the migration verification output in the PR body
```
