/*!
 * Tests for two pure modules in one file (batch pattern).
 *
 * tool-compress/builtin-filters.generated.ts:
 *   BUILTIN_FILTERS_TOML — auto-generated TOML string of 79 filter definitions.
 *   Pure string constant; verify structural integrity and known filter names.
 *
 * hooks/claude-code-importer.ts:
 *   importClaudeCodeSettings(options?) — reads Claude Code settings.json and
 *   converts hook blocks to HookHandlerConfig entries.
 *   Non-existent source → early return {imported:[], skipped:[...], provider:'claude'}.
 *   Valid source with command hooks → populated imported array.
 *
 * Both have zero DB/network deps. importer uses fs (readSettingsFile), which is
 * triggered by passing a custom `source` path.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { BUILTIN_FILTERS_TOML } from '../core/tool-compress/builtin-filters.generated.js'
import { importClaudeCodeSettings } from '../core/hooks/claude-code-importer.js'

// ── BUILTIN_FILTERS_TOML ──────────────────────────────────────────────────────

describe('BUILTIN_FILTERS_TOML — structure', () => {
  it('is a non-empty string', () => {
    expect(typeof BUILTIN_FILTERS_TOML).toBe('string')
    expect(BUILTIN_FILTERS_TOML.length).toBeGreaterThan(0)
  })

  it('contains [[filters]] section headers', () => {
    expect(BUILTIN_FILTERS_TOML).toContain('[[filters]]')
  })

  it('contains exactly 79 filter name entries', () => {
    const nameMatches = BUILTIN_FILTERS_TOML.match(/^name = /gm)
    expect(nameMatches).toHaveLength(79)
  })

  it('contains priority values', () => {
    expect(BUILTIN_FILTERS_TOML).toContain('priority')
  })

  it('contains detect arrays', () => {
    expect(BUILTIN_FILTERS_TOML).toContain('detect')
  })

  it('contains [filters.pipeline] sections', () => {
    expect(BUILTIN_FILTERS_TOML).toContain('[filters.pipeline]')
  })

  it('includes the vitest filter', () => {
    expect(BUILTIN_FILTERS_TOML).toContain('"vitest"')
  })

  it('includes the eslint filter', () => {
    expect(BUILTIN_FILTERS_TOML).toContain('"eslint"')
  })

  it('includes the git-diff filter', () => {
    expect(BUILTIN_FILTERS_TOML).toContain('"git-diff"')
  })

  it('includes the tsc filter', () => {
    expect(BUILTIN_FILTERS_TOML).toContain('"tsc"')
  })

  it('does not contain "TODO" placeholder strings', () => {
    expect(BUILTIN_FILTERS_TOML).not.toContain('TODO')
  })
})

// ── importClaudeCodeSettings — non-existent source ────────────────────────────

describe('importClaudeCodeSettings — missing source file', () => {
  const MISSING_PATH = '/nonexistent/path/claude/settings.json'

  it('returns provider=claude', () => {
    const result = importClaudeCodeSettings({ source: MISSING_PATH })
    expect(result.provider).toBe('claude')
  })

  it('returns empty imported array', () => {
    const result = importClaudeCodeSettings({ source: MISSING_PATH })
    expect(result.imported).toHaveLength(0)
  })

  it('returns non-empty skipped array', () => {
    const result = importClaudeCodeSettings({ source: MISSING_PATH })
    expect(result.skipped.length).toBeGreaterThan(0)
  })

  it('returns source matching the input path', () => {
    const result = importClaudeCodeSettings({ source: MISSING_PATH })
    expect(result.source).toBe(MISSING_PATH)
  })
})

// ── importClaudeCodeSettings — valid settings file ────────────────────────────

describe('importClaudeCodeSettings — valid settings file', () => {
  const TEMP_FILE = join(tmpdir(), 'test-claude-settings-agf.json')

  beforeAll(() => {
    writeFileSync(
      TEMP_FILE,
      JSON.stringify({
        hooks: {
          PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo hello' }] }],
        },
      }),
    )
  })

  afterAll(() => {
    if (existsSync(TEMP_FILE)) unlinkSync(TEMP_FILE)
  })

  it('returns provider=claude for valid file', () => {
    const result = importClaudeCodeSettings({ source: TEMP_FILE })
    expect(result.provider).toBe('claude')
  })

  it('imports the command hook', () => {
    const result = importClaudeCodeSettings({ source: TEMP_FILE })
    expect(result.imported.length).toBeGreaterThan(0)
  })

  it('imported handler has kind=shell', () => {
    const result = importClaudeCodeSettings({ source: TEMP_FILE })
    const handler = result.imported[0]
    expect(handler.kind).toBe('shell')
  })

  it('imported handler has agentSource=claude', () => {
    const result = importClaudeCodeSettings({ source: TEMP_FILE })
    const handler = result.imported[0]
    expect(handler.agentSource).toBe('claude')
  })

  it('imports zero handlers from empty hooks object', () => {
    const emptyFile = join(tmpdir(), 'test-claude-empty-agf.json')
    writeFileSync(emptyFile, JSON.stringify({ hooks: {} }))
    const result = importClaudeCodeSettings({ source: emptyFile })
    expect(result.imported).toHaveLength(0)
    unlinkSync(emptyFile)
  })
})
