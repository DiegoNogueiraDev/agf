import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emitClaudeSettings } from '../core/init/emit-claude-config.js'

describe('emitClaudeSettings', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'emit-claude-config-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates settings file on first call', () => {
    const result = emitClaudeSettings(tmpDir)
    expect(result.action).toBe('created')
  })

  it('creates .claude/settings.local.json file', () => {
    emitClaudeSettings(tmpDir)
    expect(existsSync(join(tmpDir, '.claude', 'settings.local.json'))).toBe(true)
  })

  it('dryRun does not create settings file', () => {
    emitClaudeSettings(tmpDir, { dryRun: true })
    expect(existsSync(join(tmpDir, '.claude', 'settings.local.json'))).toBe(false)
  })

  it('dryRun returns created or patched (action reflects intent, not actual write)', () => {
    const result = emitClaudeSettings(tmpDir, { dryRun: true })
    expect(['created', 'patched']).toContain(result.action)
  })

  it('returns skipped-noop on second identical call', () => {
    emitClaudeSettings(tmpDir)
    const second = emitClaudeSettings(tmpDir)
    expect(second.action).toBe('skipped-noop')
  })

  it('returns patched when force is true and file exists', () => {
    emitClaudeSettings(tmpDir)
    const second = emitClaudeSettings(tmpDir, { force: true })
    expect(second.action).toBe('patched')
  })

  it('does not throw when called twice', () => {
    emitClaudeSettings(tmpDir)
    expect(() => emitClaudeSettings(tmpDir)).not.toThrow()
  })

  it('result has bytes field', () => {
    const result = emitClaudeSettings(tmpDir)
    expect(typeof result.bytes).toBe('number')
    expect(result.bytes).toBeGreaterThan(0)
  })
})
