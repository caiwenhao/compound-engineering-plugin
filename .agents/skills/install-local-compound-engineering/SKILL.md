---
name: install-local-compound-engineering
description: Install the current compound-engineering checkout into Claude Code or Codex CLI, refresh the local marketplace source after repo edits, and verify that both CLIs point at the local repo instead of the public marketplace. Use for plugin development and local dogfooding.
argument-hint: "[--target claude|codex|both] [--replace] [repo path]"
---

# Install Local Compound Engineering

Register the current repository checkout as the marketplace source for Claude Code, Codex, or both, then refresh the matching install.

Use this for local development and dogfooding. Prefer this repo checkout over any GitHub marketplace source when validating unpublished changes.

## Quick Start

1. Resolve the repo root from the current working directory.
2. Run the bundled installer script:

```bash
bash scripts/install-local-compound-engineering.sh --target both /path/to/compound-engineering-plugin
```

Use `--target codex` for Codex only, or `--target claude` for Claude Code only.

If the script reports that the marketplace exists from a different source, ask for explicit confirmation before replacing it, then rerun with `--replace`:

```bash
bash scripts/install-local-compound-engineering.sh --replace --target both /path/to/compound-engineering-plugin
```

## Verification

After install, verify the selected target:

- `claude plugin marketplace list` reports `/path/to/compound-engineering-plugin`
- `claude plugin list` shows `compound-engineering@compound-engineering-plugin`
- `~/.codex/compound-engineering/install-manifest.json` exists when Codex was targeted
- `~/.codex/agents/compound-engineering/` contains agent TOML files when Codex was targeted
- `~/.codex/plugins/cache/compound-engineering-plugin/compound-engineering/<version>/skills/ce-flow/SKILL.md` reflects the current checkout when Codex was targeted

## Rules

- Default to `claude` when the user explicitly asks for Claude Code, `codex` for Codex, and `both` only when both need refresh.
- If an existing marketplace points somewhere else, ask before using `--replace`.
- Do not touch unrelated Codex or Claude config.
- For Codex local directory marketplaces, sync the versioned plugin cache from the local checkout. Codex does not upgrade local directory marketplaces via `codex plugin marketplace upgrade`, so relying only on `marketplace add` can leave stale `~/.codex/plugins/cache/.../<version>/` skill files.

## Common Failure Modes

- `already added from a different source`: ask for confirmation, then rerun with `--replace`.
- `codex plugin marketplace upgrade ... is not configured as a Git marketplace`: expected for local directory marketplaces; use this skill's script instead.
- Current Codex or Claude sessions may cache skill metadata. Restart the session after installing if command names or skill frontmatter changed.
