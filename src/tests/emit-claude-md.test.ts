import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emitClaudeMd } from '../core/init/emit-claude-md.js'

describe('emitClaudeMd', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'emit-claude-md-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates CLAUDE.md when it does not exist', () => {
    const result = emitClaudeMd(tmpDir)
    expect(result.action).toBe('created')
    expect(existsSync(join(tmpDir, 'CLAUDE.md'))).toBe(true)
  })

  it('returns bytes > 0 when created', () => {
    const result = emitClaudeMd(tmpDir)
    expect((result as { action: string; bytes: number }).bytes).toBeGreaterThan(0)
  })

  it('returns skipped-existing when CLAUDE.md already exists', () => {
    emitClaudeMd(tmpDir)
    const second = emitClaudeMd(tmpDir)
    expect(second.action).toBe('skipped-existing')
  })

  it('is idempotent — file not modified on second call', () => {
    emitClaudeMd(tmpDir)
    const firstContent = readFileSync(join(tmpDir, 'CLAUDE.md'), 'utf8')
    emitClaudeMd(tmpDir)
    const secondContent = readFileSync(join(tmpDir, 'CLAUDE.md'), 'utf8')
    expect(firstContent).toBe(secondContent)
  })
})
