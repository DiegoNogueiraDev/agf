import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ensureClaudeIgnore,
  ensureCopilotIgnore,
  updateClaudeIgnore,
  updateCopilotIgnore,
} from '../core/config/ignore-templates.js'

describe('ensureClaudeIgnore', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ignore-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates .claudeignore when absent', () => {
    const result = ensureClaudeIgnore(tmpDir)
    expect(result).toBe(true)
    expect(existsSync(join(tmpDir, '.claudeignore'))).toBe(true)
  })

  it('returns false when .claudeignore already exists', () => {
    ensureClaudeIgnore(tmpDir)
    const result = ensureClaudeIgnore(tmpDir)
    expect(result).toBe(false)
  })

  it('does not overwrite existing .claudeignore', () => {
    writeFileSync(join(tmpDir, '.claudeignore'), 'custom content')
    ensureClaudeIgnore(tmpDir)
    expect(readFileSync(join(tmpDir, '.claudeignore'), 'utf-8')).toBe('custom content')
  })

  it('created file contains node_modules/', () => {
    ensureClaudeIgnore(tmpDir)
    const content = readFileSync(join(tmpDir, '.claudeignore'), 'utf-8')
    expect(content).toContain('node_modules/')
  })
})

describe('ensureCopilotIgnore', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'copilot-ignore-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates .copilotignore when absent', () => {
    const result = ensureCopilotIgnore(tmpDir)
    expect(result).toBe(true)
    expect(existsSync(join(tmpDir, '.copilotignore'))).toBe(true)
  })

  it('returns false when .copilotignore already exists', () => {
    ensureCopilotIgnore(tmpDir)
    const result = ensureCopilotIgnore(tmpDir)
    expect(result).toBe(false)
  })
})

describe('updateClaudeIgnore', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'update-claudeignore-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns created when file does not exist', () => {
    const result = updateClaudeIgnore(tmpDir)
    expect(result.status).toBe('created')
  })

  it('creates the .claudeignore file', () => {
    updateClaudeIgnore(tmpDir)
    expect(existsSync(join(tmpDir, '.claudeignore'))).toBe(true)
  })

  it('returns up-to-date when file already matches template', () => {
    updateClaudeIgnore(tmpDir)
    const result = updateClaudeIgnore(tmpDir)
    expect(result.status).toBe('up-to-date')
  })

  it('returns updated when file has different content', () => {
    writeFileSync(join(tmpDir, '.claudeignore'), 'old content')
    const result = updateClaudeIgnore(tmpDir)
    expect(result.status).toBe('updated')
  })

  it('dryRun returns created without writing', () => {
    const result = updateClaudeIgnore(tmpDir, true)
    expect(result.status).toBe('created')
    expect(existsSync(join(tmpDir, '.claudeignore'))).toBe(false)
  })

  it('result has a message string', () => {
    const result = updateClaudeIgnore(tmpDir)
    expect(typeof result.message).toBe('string')
  })
})

describe('updateCopilotIgnore', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'update-copilotignore-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns created on first call', () => {
    const result = updateCopilotIgnore(tmpDir)
    expect(result.status).toBe('created')
  })

  it('returns up-to-date on second call', () => {
    updateCopilotIgnore(tmpDir)
    const result = updateCopilotIgnore(tmpDir)
    expect(result.status).toBe('up-to-date')
  })
})
