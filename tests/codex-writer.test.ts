import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { mergeCodexConfig, renderCodexConfig, writeCodexBundle, mergeCodexHooks } from "../src/targets/codex"
import type { CodexBundle } from "../src/types/codex"
import { loadClaudePlugin } from "../src/parsers/claude"
import { convertClaudeToCodex } from "../src/converters/claude-to-codex"

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function entryExists(filePath: string): Promise<boolean> {
  try {
    await fs.lstat(filePath)
    return true
  } catch {
    return false
  }
}

describe("writeCodexBundle", () => {
  test("writes prompts, skills, and config", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-test-"))
    const bundle: CodexBundle = {
      prompts: [{ name: "command-one", content: "Prompt content" }],
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
      generatedSkills: [{ name: "agent-skill", content: "Skill content" }],
      agents: [
        {
          name: "research-ce-repo-research-analyst",
          description: "Repo research",
          instructions: "Research the repository.",
        },
      ],
      mcpServers: {
        local: { command: "echo", args: ["hello"], env: { KEY: "VALUE" } },
        remote: {
          url: "https://example.com/mcp",
          headers: { Authorization: "Bearer token" },
        },
      },
    }

    await writeCodexBundle(tempRoot, bundle)

    expect(await exists(path.join(tempRoot, ".codex", "prompts", "command-one.md"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".codex", "skills", "skill-one", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".codex", "skills", "agent-skill", "SKILL.md"))).toBe(true)
    const agentPath = path.join(tempRoot, ".codex", "agents", "research-ce-repo-research-analyst.toml")
    expect(await exists(agentPath)).toBe(true)
    const agentToml = await fs.readFile(agentPath, "utf8")
    expect(agentToml).toContain('name = "research-ce-repo-research-analyst"')
    expect(agentToml).toContain('developer_instructions = "Research the repository."')
    const configPath = path.join(tempRoot, ".codex", "config.toml")
    expect(await exists(configPath)).toBe(true)

    const config = await fs.readFile(configPath, "utf8")
    expect(config).toContain("# BEGIN Compound Engineering plugin MCP -- do not edit this block")
    expect(config).toContain("# END Compound Engineering plugin MCP")
    expect(config).toContain("[mcp_servers.local]")
    expect(config).toContain("command = \"echo\"")
    expect(config).toContain("args = [\"hello\"]")
    expect(config).toContain("[mcp_servers.local.env]")
    expect(config).toContain("KEY = \"VALUE\"")
    expect(config).toContain("[mcp_servers.remote]")
    expect(config).toContain("url = \"https://example.com/mcp\"")
    expect(config).toContain("http_headers")
  })

  test("throws when two agents sanitize to the same Codex filename", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-agent-collision-"))
    const bundle: CodexBundle = {
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      agents: [
        {
          name: "research:ce-learnings-researcher",
          description: "First",
          instructions: "First agent body.",
        },
        {
          name: "research-ce-learnings-researcher",
          description: "Second",
          instructions: "Second agent body.",
        },
      ],
    }

    await expect(writeCodexBundle(tempRoot, bundle)).rejects.toThrow(
      /Codex agent filename collision/,
    )

    // Verify neither agent was silently dropped: the first agent should not have
    // been written before the collision was detected (guard runs before writes).
    const agentsRoot = path.join(tempRoot, ".codex", "agents")
    expect(
      await exists(path.join(agentsRoot, "research-ce-learnings-researcher.toml")),
    ).toBe(false)
  })

  test("writes directly into a .codex output root", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-home-"))
    const codexRoot = path.join(tempRoot, ".codex")
    const bundle: CodexBundle = {
      prompts: [{ name: "command-one", content: "Prompt content" }],
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
      generatedSkills: [],
    }

    await writeCodexBundle(codexRoot, bundle)

    expect(await exists(path.join(codexRoot, "prompts", "command-one.md"))).toBe(true)
    expect(await exists(path.join(codexRoot, "skills", "skill-one", "SKILL.md"))).toBe(true)
  })

  test("preserves existing config.toml content while updating MCP config", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-backup-"))
    const codexRoot = path.join(tempRoot, ".codex")
    const configPath = path.join(codexRoot, "config.toml")

    // Create existing config with user settings
    await fs.mkdir(codexRoot, { recursive: true })
    const originalContent = "# My original config\n[custom]\nkey = \"value\"\n"
    await fs.writeFile(configPath, originalContent)

    const bundle: CodexBundle = {
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      mcpServers: { test: { command: "echo" } },
    }

    await writeCodexBundle(codexRoot, bundle)

    // Existing config should be preserved alongside updated MCP config
    const newConfig = await fs.readFile(configPath, "utf8")
    expect(newConfig).toContain("# My original config")
    expect(newConfig).toContain("[custom]")
    expect(newConfig).toContain("key = \"value\"")
    expect(newConfig).toContain("[mcp_servers.test]")
    expect(newConfig).toContain("# BEGIN Compound Engineering plugin MCP -- do not edit this block")
    expect(newConfig).toContain("# END Compound Engineering plugin MCP")
    // User's original config should be preserved
    expect(newConfig).toContain("# My original config")
    expect(newConfig).toContain("[custom]")
    expect(newConfig).toContain('key = "value"')

    // Backup should still exist with original content
    const files = await fs.readdir(codexRoot)
    const backupFileName = files.find((f) => f.startsWith("config.toml.bak."))
    expect(backupFileName).toBeDefined()

    const backupContent = await fs.readFile(path.join(codexRoot, backupFileName!), "utf8")
    expect(backupContent).toBe(originalContent)
  })

  test("replaces the managed MCP block on reinstall instead of appending duplicates", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-reinstall-"))
    const codexRoot = path.join(tempRoot, ".codex")
    const configPath = path.join(codexRoot, "config.toml")

    await fs.mkdir(codexRoot, { recursive: true })
    await fs.writeFile(
      configPath,
      [
        "[custom]",
        "enabled = true",
        "",
        "# BEGIN compound-plugin Codex MCP",
        "[mcp_servers.old]",
        "command = \"old\"",
        "# END compound-plugin Codex MCP",
        "",
      ].join("\n"),
    )

    const bundle: CodexBundle = {
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      mcpServers: { test: { command: "echo" } },
    }

    await writeCodexBundle(codexRoot, bundle)

    const content = await fs.readFile(configPath, "utf8")
    expect(content).toContain("[custom]")
    expect(content).toContain("[mcp_servers.test]")
    expect(content).not.toContain("[mcp_servers.old]")
    expect(content.match(/# BEGIN compound-plugin Codex MCP/g)?.length).toBe(1)
    expect(content.match(/# END compound-plugin Codex MCP/g)?.length).toBe(1)
  })

  test("transforms copied SKILL.md files using Codex invocation targets", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-skill-transform-"))
    const sourceSkillDir = path.join(tempRoot, "source-skill")
    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      `---
name: ce-brainstorm
description: Brainstorm workflow
---

Continue with /ce-plan when ready.
Or use /workflows:plan if you're following an older doc.
Use /todo-resolve for deeper research.
`,
    )
    await fs.writeFile(
      path.join(sourceSkillDir, "notes.md"),
      "Reference docs still mention /ce-plan here.\n",
    )

    const bundle: CodexBundle = {
      prompts: [],
      skillDirs: [{ name: "ce-brainstorm", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      invocationTargets: {
        promptTargets: {
          "todo-resolve": "todo-resolve",
        },
        skillTargets: {
          "ce-plan": "ce-plan",
          "workflows-plan": "ce-plan",
        },
      },
    }

    await writeCodexBundle(tempRoot, bundle)

    const installedSkill = await fs.readFile(
      path.join(tempRoot, ".codex", "skills", "ce-brainstorm", "SKILL.md"),
      "utf8",
    )
    expect(installedSkill).toContain("the ce-plan skill")
    expect(installedSkill).not.toContain("/workflows:plan")
    expect(installedSkill).toContain("/prompts:todo-resolve")

    const notes = await fs.readFile(
      path.join(tempRoot, ".codex", "skills", "ce-brainstorm", "notes.md"),
      "utf8",
    )
    expect(notes).toContain("/ce-plan")
  })

  test("transforms namespaced Task calls in copied SKILL.md files", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-ns-task-"))
    const sourceSkillDir = path.join(tempRoot, "source-skill")
    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      `---
name: ce-plan
description: Planning workflow
---

Run these research agents:

- Task compound-engineering:research:repo-research-analyst(feature_description)
- Task compound-engineering:research:learnings-researcher(feature_description)

Also run bare agents:

- Task best-practices-researcher(topic)
- Task compound-engineering:review:code-simplicity-reviewer()
`,
    )

    const bundle: CodexBundle = {
      prompts: [],
      skillDirs: [{ name: "ce-plan", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      invocationTargets: {
        promptTargets: {},
        skillTargets: {},
      },
    }

    await writeCodexBundle(tempRoot, bundle)

    const installedSkill = await fs.readFile(
      path.join(tempRoot, ".codex", "skills", "ce-plan", "SKILL.md"),
      "utf8",
    )

    // Namespaced Task calls should be rewritten using the final segment
    expect(installedSkill).toContain("Use the $repo-research-analyst skill to: feature_description")
    expect(installedSkill).toContain("Use the $learnings-researcher skill to: feature_description")
    expect(installedSkill).not.toContain("Task compound-engineering:")

    // Bare Task calls should still be rewritten
    expect(installedSkill).toContain("Use the $best-practices-researcher skill to: topic")
    expect(installedSkill).not.toContain("Task best-practices-researcher")

    // Zero-arg Task calls should be rewritten without trailing "to:"
    expect(installedSkill).toContain("Use the $code-simplicity-reviewer skill")
    expect(installedSkill).not.toContain("code-simplicity-reviewer skill to:")
  })

  test("preserves unknown slash text in copied SKILL.md files", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-skill-preserve-"))
    const sourceSkillDir = path.join(tempRoot, "source-skill")
    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      `---
name: proof
description: Proof skill
---

Route examples:
- /users
- /settings

API examples:
- https://www.proofeditor.ai/api/agent/{slug}/state
- https://www.proofeditor.ai/share/markdown

Workflow handoff:
- /ce-plan
`,
    )

    const bundle: CodexBundle = {
      prompts: [],
      skillDirs: [{ name: "proof", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      invocationTargets: {
        promptTargets: {},
        skillTargets: {
          "ce-plan": "ce-plan",
        },
      },
    }

    await writeCodexBundle(tempRoot, bundle)

    const installedSkill = await fs.readFile(
      path.join(tempRoot, ".codex", "skills", "proof", "SKILL.md"),
      "utf8",
    )

    expect(installedSkill).toContain("/users")
    expect(installedSkill).toContain("/settings")
    expect(installedSkill).toContain("https://www.proofeditor.ai/api/agent/{slug}/state")
    expect(installedSkill).toContain("https://www.proofeditor.ai/share/markdown")
    expect(installedSkill).toContain("the ce-plan skill")
    expect(installedSkill).not.toContain("/prompts:users")
    expect(installedSkill).not.toContain("/prompts:settings")
    expect(installedSkill).not.toContain("https://prompts:www.proofeditor.ai")
  })

  test("removes orphan sidecar dir when retained agent declares no sidecars", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-test-"))
    const agentsRoot = path.join(tempRoot, ".codex", "agents")
    const orphanDir = path.join(agentsRoot, "ce-foo", "stale-content")
    await fs.mkdir(orphanDir, { recursive: true })
    await fs.writeFile(path.join(orphanDir, "leftover.txt"), "stale", "utf8")
    await fs.writeFile(path.join(agentsRoot, "ce-foo.toml"), "old-toml", "utf8")

    const bundle: CodexBundle = {
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      agents: [
        {
          name: "ce-foo",
          description: "Foo agent",
          instructions: "Do foo.",
        },
      ],
      mcpServers: {},
    }

    await writeCodexBundle(tempRoot, bundle)

    expect(await entryExists(path.join(agentsRoot, "ce-foo"))).toBe(false)
    expect(await exists(path.join(agentsRoot, "ce-foo.toml"))).toBe(true)
  })

  test("keeps sidecar dir when retained agent declares sidecars", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-test-"))
    const sidecarSource = await fs.mkdtemp(path.join(os.tmpdir(), "codex-sidecar-src-"))
    await fs.writeFile(path.join(sidecarSource, "script.sh"), "#!/bin/sh\necho hi\n", "utf8")

    const bundle: CodexBundle = {
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      agents: [
        {
          name: "ce-foo",
          description: "Foo agent",
          instructions: "Do foo.",
          sidecarDirs: [{ sourceDir: sidecarSource, targetName: "scripts" }],
        },
      ],
      mcpServers: {},
    }

    await writeCodexBundle(tempRoot, bundle)

    const agentsRoot = path.join(tempRoot, ".codex", "agents")
    expect(await exists(path.join(agentsRoot, "ce-foo.toml"))).toBe(true)
    expect(await exists(path.join(agentsRoot, "ce-foo", "scripts", "script.sh"))).toBe(true)
  })

  test("leaves unrelated directories under agentsRoot alone", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-test-"))
    const agentsRoot = path.join(tempRoot, ".codex", "agents")
    const unrelatedDir = path.join(agentsRoot, "ce-bar-extra")
    await fs.mkdir(unrelatedDir, { recursive: true })
    await fs.writeFile(path.join(unrelatedDir, "keep-me.txt"), "keep", "utf8")

    const bundle: CodexBundle = {
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      agents: [
        {
          name: "ce-foo",
          description: "Foo agent",
          instructions: "Do foo.",
        },
      ],
      mcpServers: {},
    }

    await writeCodexBundle(tempRoot, bundle)

    expect(await exists(path.join(unrelatedDir, "keep-me.txt"))).toBe(true)
  })
})

describe("renderCodexConfig", () => {
  test("skips servers with neither command nor url", () => {
    const result = renderCodexConfig({ broken: {} })
    expect(result).toBeNull()
  })

  test("skips malformed servers but keeps valid ones", () => {
    const result = renderCodexConfig({
      valid: { command: "echo" },
      broken: {},
      alsoValid: { url: "https://example.com/mcp" },
    })
    expect(result).not.toBeNull()
    expect(result).toContain("[mcp_servers.valid]")
    expect(result).toContain("[mcp_servers.alsoValid]")
    expect(result).not.toContain("[mcp_servers.broken]")
  })

  test("returns null for empty or undefined input", () => {
    expect(renderCodexConfig(undefined)).toBeNull()
    expect(renderCodexConfig({})).toBeNull()
  })
})

describe("mergeCodexConfig", () => {
  test("returns managed block when no existing content", () => {
    const result = mergeCodexConfig("", "[mcp_servers.test]\ncommand = \"echo\"")
    expect(result).toContain("# BEGIN Compound Engineering plugin MCP")
    expect(result).toContain("[mcp_servers.test]")
    expect(result).toContain("# END Compound Engineering plugin MCP")
  })

  test("preserves user content and replaces managed block", () => {
    const existing = [
      "[user]",
      'model = "gpt-4.1"',
      "",
      "# BEGIN Compound Engineering plugin MCP -- do not edit this block",
      "[mcp_servers.old]",
      'command = "old"',
      "# END Compound Engineering plugin MCP",
      "",
      "[after]",
      'key = "value"',
    ].join("\n")

    const result = mergeCodexConfig(existing, "[mcp_servers.new]\ncommand = \"new\"")!
    expect(result).toContain("[user]")
    expect(result).toContain("[after]")
    expect(result).not.toContain("[mcp_servers.old]")
    expect(result).toContain("[mcp_servers.new]")
  })

  test("strips previous-generation markers", () => {
    const existing = [
      "[user]",
      'model = "gpt-4.1"',
      "",
      "# BEGIN compound-plugin Claude Code MCP",
      "[mcp_servers.old]",
      'command = "old"',
      "# END compound-plugin Claude Code MCP",
    ].join("\n")

    const result = mergeCodexConfig(existing, "[mcp_servers.new]\ncommand = \"new\"")!
    expect(result).not.toContain("# BEGIN compound-plugin Claude Code MCP")
    expect(result).not.toContain("[mcp_servers.old]")
    expect(result).toContain("# BEGIN Compound Engineering plugin MCP")
    expect(result).toContain("[mcp_servers.new]")
  })

  test("returns cleaned content (no block) when mcpToml is null", () => {
    const existing = [
      "[user]",
      'model = "gpt-4.1"',
      "",
      "# BEGIN Compound Engineering plugin MCP -- do not edit this block",
      "[mcp_servers.stale]",
      'command = "stale"',
      "# END Compound Engineering plugin MCP",
    ].join("\n")

    const result = mergeCodexConfig(existing, null)!
    expect(result).toContain("[user]")
    expect(result).not.toContain("mcp_servers.stale")
    expect(result).not.toContain("# BEGIN")
  })

  test("strips unmarked legacy format (# Generated by compound-plugin)", () => {
    const existing = [
      "# Generated by compound-plugin",
      "",
      "[mcp_servers.old]",
      'command = "old"',
      "",
    ].join("\n")

    const result = mergeCodexConfig(existing, "[mcp_servers.new]\ncommand = \"new\"")!
    expect(result).not.toContain("# Generated by compound-plugin")
    expect(result).not.toContain("[mcp_servers.old]")
    expect(result).toContain("# BEGIN Compound Engineering plugin MCP")
    expect(result).toContain("[mcp_servers.new]")
  })

  test("preserves unmarked legacy content when no MCP servers are incoming", () => {
    const existing = [
      'model = "gpt-5.4"',
      "",
      "# Generated by compound-plugin",
      "",
      "[projects.example]",
      'trust_level = "trusted"',
    ].join("\n")

    const result = mergeCodexConfig(existing, null)!
    expect(result).toContain("# Generated by compound-plugin")
    expect(result).toContain("[projects.example]")
    expect(result).toContain('trust_level = "trusted"')
  })

  test("strips bounded legacy MCP block when no MCP servers are incoming", () => {
    const existing = [
      "[user]",
      'model = "gpt-5.4"',
      "",
      "# MCP servers synced from Claude Code",
      "",
      "[mcp_servers.old]",
      'command = "old"',
    ].join("\n")

    const result = mergeCodexConfig(existing, null)!
    expect(result).toContain("[user]")
    expect(result).not.toContain("# MCP servers synced from Claude Code")
    expect(result).not.toContain("[mcp_servers.old]")
  })

  test("returns existing content byte-for-byte when no MCP servers or managed blocks exist", () => {
    const existing = [
      'model = "gpt-5.4"',
      "",
      "# Generated by compound-plugin",
      "",
      "[projects.example]",
      'trust_level = "trusted"',
      "",
    ].join("\n")

    expect(mergeCodexConfig(existing, null)).toBe(existing)
  })

  test("preserves user config before unmarked legacy format", () => {
    const existing = [
      "[user]",
      'model = "gpt-4.1"',
      "",
      "# Generated by compound-plugin",
      "",
      "[mcp_servers.old]",
      'command = "old"',
    ].join("\n")

    const result = mergeCodexConfig(existing, "[mcp_servers.new]\ncommand = \"new\"")!
    expect(result).toContain("[user]")
    expect(result).not.toContain("# Generated by compound-plugin")
    expect(result).not.toContain("[mcp_servers.old]")
    expect(result).toContain("[mcp_servers.new]")
  })

  test("returns null when no existing content and no mcpToml", () => {
    expect(mergeCodexConfig("", null)).toBeNull()
  })

  test("returns empty string when file was only a managed block and mcpToml is null", () => {
    const existing = [
      "# BEGIN Compound Engineering plugin MCP -- do not edit this block",
      "[mcp_servers.stale]",
      'command = "stale"',
      "# END Compound Engineering plugin MCP",
    ].join("\n")

    const result = mergeCodexConfig(existing, null)
    expect(result).toBe("")
  })
})

describe("mergeCodexHooks", () => {
  test("writes hooks with _managed index for a new plugin", () => {
    const result = mergeCodexHooks(null, {
      SessionStart: [{ matcher: "*", hooks: [{ type: "command", command: "my-hook" }] }],
    }, "my-plugin")

    const hooks = result.hooks as Record<string, unknown[]>
    expect(hooks.SessionStart).toHaveLength(1)
    expect((hooks.SessionStart[0] as Record<string, unknown>).matcher).toBe("*")
    // No _source field injected into hook entries
    expect((hooks.SessionStart[0] as Record<string, unknown>)._source).toBeUndefined()
    // Managed index tracks ownership
    const managed = result._managed as Record<string, Record<string, number[]>>
    expect(managed["my-plugin"].SessionStart).toEqual([0])
  })

  test("preserves hooks from other plugins", () => {
    const existing = {
      hooks: {
        SessionStart: [{ matcher: "*", hooks: [{ type: "command", command: "other-hook" }] }],
      },
      _managed: { "other-plugin": { SessionStart: [0] } },
    }

    const result = mergeCodexHooks(existing, {
      Stop: [{ matcher: "*", hooks: [{ type: "command", command: "my-stop" }] }],
    }, "my-plugin")

    const hooks = result.hooks as Record<string, unknown[]>
    // Other plugin's hook preserved
    expect(hooks.SessionStart).toHaveLength(1)
    expect((hooks.SessionStart[0] as Record<string, unknown>).command).toBeUndefined()
    // Our hook added
    expect(hooks.Stop).toHaveLength(1)
  })

  test("re-install replaces managed entries idempotently", () => {
    const existing = {
      hooks: {
        SessionStart: [
          { matcher: "*", hooks: [{ type: "command", command: "old-hook" }] },
        ],
      },
      _managed: { "my-plugin": { SessionStart: [0] } },
    }

    const result = mergeCodexHooks(existing, {
      SessionStart: [{ matcher: "*", hooks: [{ type: "command", command: "new-hook" }] }],
    }, "my-plugin")

    const hooks = result.hooks as Record<string, unknown[]>
    expect(hooks.SessionStart).toHaveLength(1)
    // Old hook replaced with new
    const entry = hooks.SessionStart[0] as Record<string, unknown>
    const entryHooks = entry.hooks as Array<Record<string, unknown>>
    expect(entryHooks[0].command).toBe("new-hook")
  })

  test("cleans up managed entries when plugin removes hooks", () => {
    const existing = {
      hooks: {
        SessionStart: [
          { matcher: "*", hooks: [{ type: "command", command: "manual-hook" }] },
          { matcher: "*", hooks: [{ type: "command", command: "plugin-hook" }] },
        ],
      },
      _managed: { "my-plugin": { SessionStart: [1] } },
    }

    const result = mergeCodexHooks(existing, {}, "my-plugin")

    const hooks = result.hooks as Record<string, unknown[]>
    // Manual hook preserved, plugin hook removed
    expect(hooks.SessionStart).toHaveLength(1)
    const entryHooks = (hooks.SessionStart[0] as Record<string, unknown>).hooks as Array<Record<string, unknown>>
    expect(entryHooks[0].command).toBe("manual-hook")
    // Managed index cleaned
    expect((result._managed as Record<string, unknown>)?.["my-plugin"]).toBeUndefined()
  })

  test("preserves untagged manual hook entries", () => {
    const existing = {
      hooks: {
        SessionStart: [
          { matcher: "*", hooks: [{ type: "command", command: "manual" }] },
        ],
      },
      // No _managed — all entries are manual
    }

    const result = mergeCodexHooks(existing, {
      Stop: [{ matcher: "*", hooks: [{ type: "command", command: "plugin-stop" }] }],
    }, "my-plugin")

    const hooks = result.hooks as Record<string, unknown[]>
    expect(hooks.SessionStart).toHaveLength(1)
    expect(hooks.Stop).toHaveLength(1)
  })

  test("cleans up legacy _source-tagged entries from previous format", () => {
    const existing = {
      hooks: {
        SessionStart: [
          { matcher: "*", hooks: [{ type: "command", command: "legacy" }], _source: "my-plugin" },
          { matcher: "*", hooks: [{ type: "command", command: "manual" }] },
        ],
      },
    }

    const result = mergeCodexHooks(existing, {
      SessionStart: [{ matcher: "*", hooks: [{ type: "command", command: "new" }] }],
    }, "my-plugin")

    const hooks = result.hooks as Record<string, unknown[]>
    // Legacy _source entry removed, manual preserved, new added
    expect(hooks.SessionStart).toHaveLength(2)
  })
})
