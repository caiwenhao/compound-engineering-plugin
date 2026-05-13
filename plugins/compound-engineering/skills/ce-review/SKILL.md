---
name: ce-review
description: "Legacy compatibility alias for ce-code-review. Use ce-code-review for new invocations."
argument-hint: "[same arguments as ce-code-review]"
---

# Legacy Code Review Alias

`ce-review` is a compatibility alias. Do not run an independent review workflow from this skill.

Invoke `ce-code-review` with the same arguments and follow that skill's instructions. The canonical skill owns scope detection, reviewer selection, references, scripts, artifacts, autofix behavior, and final reporting.

Do not reinterpret this alias as report-only. With no mode argument, `ce-review` inherits `ce-code-review`'s default Interactive mode, including automatic `safe_auto -> review-fixer` fixes. Use `mode:report-only` explicitly only when the user asks for a read-only review.
