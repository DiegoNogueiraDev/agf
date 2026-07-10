/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

// ── Aider ──────────────────────────────────────────────────────────

describe('aider', () => {
  it('importAiderSettings returns empty when source missing', async () => {
    const mod = await import('../core/hooks/providers/aider.js')
    const r = mod.importAiderSettings({ source: '/nonexistent/aider.yml' })
    expect(r.imported).toEqual([])
    expect(r.provider).toBe('aider')
  })

  it('importAiderSettings parses commands from config', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aider-test-'))
    const cfg = join(tmp, '.aider.conf.yml')
    writeFileSync(cfg, 'lint-cmd: "echo lint"\ntest-cmd: "echo test"')
    const mod = await import('../core/hooks/providers/aider.js')
    const r = mod.importAiderSettings({ source: cfg })
    expect(r.imported.length).toBeGreaterThanOrEqual(2)
    expect(r.imported.some((h) => h.channel === 'tool:post-call')).toBe(true)
    expect(r.imported.some((h) => h.channel === 'task:post-complete')).toBe(true)
    rmSync(tmp, { recursive: true })
  })

  it('installAiderBridge dry-run returns changes without writing', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aider-git-'))
    mkdirSync(join(tmp, '.git', 'hooks'), { recursive: true })
    const mod = await import('../core/hooks/providers/aider.js')
    const r = mod.installAiderBridge({ basePath: tmp, hooks: ['pre-commit'] })
    expect(r.dryRun).toBe(true)
    rmSync(tmp, { recursive: true })
  })
})

// ── Cline ──────────────────────────────────────────────────────────

describe('cline', () => {
  it('importClineSettings returns empty when source missing', async () => {
    const mod = await import('../core/hooks/providers/cline.js')
    const r = mod.importClineSettings({ source: '/nonexistent/settings.json' })
    expect(r.imported).toEqual([])
    expect(r.mcpServers).toEqual([])
  })

  it('importClineSettings parses MCP servers from VS Code settings', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cline-test-'))
    const cfg = join(tmp, 'settings.json')
    writeFileSync(cfg, JSON.stringify({ 'cline.mcpServers': { filesystem: {}, github: {} } }))
    const mod = await import('../core/hooks/providers/cline.js')
    const r = mod.importClineSettings({ source: cfg })
    expect(r.mcpServers).toEqual(['filesystem', 'github'])
    rmSync(tmp, { recursive: true })
  })
})

// ── Codex ──────────────────────────────────────────────────────────

describe('codex', () => {
  it('importCodexSettings returns empty when source missing', async () => {
    const mod = await import('../core/hooks/providers/codex.js')
    const r = mod.importCodexSettings({ source: '/nonexistent/config.toml' })
    expect(r.imported).toEqual([])
    expect(r.provider).toBe('codex')
  })

  it('importCodexSettings parses hooks from TOML', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'codex-test-'))
    const cfg = join(tmp, 'config.toml')
    writeFileSync(cfg, '[hooks]\nnotify = "echo done"\ninspect.prompt = "echo pre"')
    const mod = await import('../core/hooks/providers/codex.js')
    const r = mod.importCodexSettings({ source: cfg })
    expect(r.imported.length).toBeGreaterThanOrEqual(1)
    rmSync(tmp, { recursive: true })
  })

  it('has codexAliases with expected mappings', async () => {
    const mod = await import('../core/hooks/providers/codex.js')
    expect(mod.codexAliases.notify).toBe('task:post-complete')
    expect(mod.codexAliases['inspect.prompt']).toBe('task:pre-execute')
    expect(mod.codexAliases['inspect.tool_call']).toBe('tool:pre-call')
  })
})

// ── Continue ───────────────────────────────────────────────────────

describe('continue', () => {
  it('importContinueSettings returns empty when source missing', async () => {
    const mod = await import('../core/hooks/providers/continue.js')
    const r = mod.importContinueSettings({ source: '/nonexistent/config.json' })
    expect(r.imported).toEqual([])
    expect(r.mcpServers).toEqual([])
  })

  it('importContinueSettings parses MCP servers', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'continue-test-'))
    const cfg = join(tmp, 'config.json')
    writeFileSync(cfg, JSON.stringify({ mcpServers: { postgres: {} } }))
    const mod = await import('../core/hooks/providers/continue.js')
    const r = mod.importContinueSettings({ source: cfg })
    expect(r.mcpServers).toEqual(['postgres'])
    rmSync(tmp, { recursive: true })
  })
})

// ── Copilot ────────────────────────────────────────────────────────

describe('copilot', () => {
  it('importCopilotSettings returns empty when source missing', async () => {
    const mod = await import('../core/hooks/providers/copilot.js')
    const r = mod.importCopilotSettings({ source: '/nonexistent/hooks-dir' })
    expect(r.imported).toEqual([])
  })

  it('importCopilotSettings parses hook files', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'copilot-test-'))
    mkdirSync(tmp, { recursive: true })
    writeFileSync(
      join(tmp, 'block.json'),
      JSON.stringify({
        type: 'block',
        event: 'PreToolUse',
        command: 'echo pre',
      }),
    )
    const mod = await import('../core/hooks/providers/copilot.js')
    const r = mod.importCopilotSettings({ source: tmp })
    expect(r.imported.length).toBe(1)
    expect(r.imported[0].channel).toBe('tool:pre-call')
    rmSync(tmp, { recursive: true })
  })

  it('skips modify hooks', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'copilot-mod-'))
    mkdirSync(tmp, { recursive: true })
    writeFileSync(
      join(tmp, 'mod.json'),
      JSON.stringify({
        type: 'modify',
        event: 'PreToolUse',
        command: 'echo modify',
      }),
    )
    const mod = await import('../core/hooks/providers/copilot.js')
    const r = mod.importCopilotSettings({ source: tmp })
    expect(r.imported).toEqual([])
    expect(r.skipped.length).toBeGreaterThanOrEqual(1)
    rmSync(tmp, { recursive: true })
  })

  it('installCopilotEventBridge returns no-op disposer', async () => {
    const mod = await import('../core/hooks/providers/copilot.js')
    const disposer = mod.installCopilotEventBridge()
    expect(typeof disposer).toBe('function')
    expect(() => disposer()).not.toThrow()
  })

  it('has copilotAliases', async () => {
    const mod = await import('../core/hooks/providers/copilot.js')
    expect(mod.copilotAliases.PreToolUse).toBe('tool:pre-call')
    expect(mod.copilotAliases.Stop).toBe('task:post-complete')
  })
})

// ── Cursor ─────────────────────────────────────────────────────────

describe('cursor', () => {
  it('importCursorRules returns null when source missing', async () => {
    const mod = await import('../core/hooks/providers/cursor.js')
    const r = mod.importCursorRules({ source: '/nonexistent/rules' })
    expect(r.rulesText).toBeNull()
    expect(r.imported).toBe(0)
  })

  it('importCursorRules reads rules file', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cursor-test-'))
    const rulesPath = join(tmp, 'rules')
    writeFileSync(rulesPath, 'some cursor rules')
    const mod = await import('../core/hooks/providers/cursor.js')
    const r = mod.importCursorRules({ source: rulesPath })
    expect(r.rulesText).toBe('some cursor rules')
    expect(r.imported).toBe(1)
    rmSync(tmp, { recursive: true })
  })
})

// ── OpenCode ───────────────────────────────────────────────────────

describe('opencode', () => {
  it('importOpenCodeSettings returns empty when source missing', async () => {
    const mod = await import('../core/hooks/providers/opencode.js')
    // pluginDirs: [] keeps this deterministic — otherwise scanPlugins reads the
    // dev's real ~/.config/opencode/plugins and the assertion flakes.
    const r = mod.importOpenCodeSettings({ source: '/nonexistent/config.toml', pluginDirs: [] })
    expect(r.imported).toEqual([])
    expect(r.pluginsDiscovered).toEqual([])
  })

  it('importOpenCodeSettings parses hooks from TOML', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'opencode-test-'))
    const cfg = join(tmp, 'config.toml')
    writeFileSync(cfg, '[hooks]\npre-tool = "echo pretool"\npost-tool = "echo posttool"')
    const mod = await import('../core/hooks/providers/opencode.js')
    const r = mod.importOpenCodeSettings({ source: cfg })
    expect(r.imported.length).toBeGreaterThanOrEqual(1)
    rmSync(tmp, { recursive: true })
  })

  it('discovers plugins in directories', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'opencode-plug-'))
    mkdirSync(join(tmp, 'plugins'), { recursive: true })
    writeFileSync(join(tmp, 'plugins', 'hello.ts'), 'export {}')
    writeFileSync(join(tmp, 'plugins', 'helper.js'), 'module.exports = {}')
    const mod = await import('../core/hooks/providers/opencode.js')
    const r = mod.importOpenCodeSettings({ source: '/nonexistent', pluginDirs: [join(tmp, 'plugins')] })
    expect(r.pluginsDiscovered).toHaveLength(2)
    rmSync(tmp, { recursive: true })
  })

  it('has opencodeAliases', async () => {
    const mod = await import('../core/hooks/providers/opencode.js')
    expect(mod.opencodeAliases['pre-tool']).toBe('tool:pre-call')
    expect(mod.opencodeAliases['post-tool']).toBe('tool:post-call')
    expect(mod.opencodeAliases['session.start']).toBe('session:start')
    expect(mod.opencodeAliases['session.end']).toBe('session:end')
  })
})
