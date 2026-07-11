import { describe, it, expect } from 'vitest'
import { ReplSession } from '../tui/repl-session.js'
import { detectStack } from '../core/sandbox/stack-detector.js'
import { mkdtempSync, mkdirSync, writeFileSync, rmdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// ── ReplSession ──────────────────────────────────────────────────────────────

describe('ReplSession', () => {
  it('starts with empty history', () => {
    const session = new ReplSession()
    expect(session.getHistory()).toEqual([])
  })

  it('adds commands to history', () => {
    const session = new ReplSession()
    session.addToHistory('agf next')
    session.addToHistory('agf stats')
    expect(session.getHistory()).toEqual(['agf next', 'agf stats'])
  })

  it('returns a copy of history (immutable)', () => {
    const session = new ReplSession()
    session.addToHistory('cmd1')
    const h1 = session.getHistory()
    h1.push('injected')
    expect(session.getHistory()).toEqual(['cmd1'])
  })

  it('trims history when maxHistory is exceeded', () => {
    const session = new ReplSession(3)
    session.addToHistory('a')
    session.addToHistory('b')
    session.addToHistory('c')
    session.addToHistory('d')
    const history = session.getHistory()
    expect(history).toHaveLength(3)
    expect(history).toEqual(['b', 'c', 'd'])
  })

  it('clears all history', () => {
    const session = new ReplSession()
    session.addToHistory('agf next')
    session.clear()
    expect(session.getHistory()).toEqual([])
  })

  it('has default prompt', () => {
    const session = new ReplSession()
    expect(session.prompt).toBe('›› ')
  })

  it('allows prompt override', () => {
    const session = new ReplSession()
    session.setPrompt('> ')
    expect(session.prompt).toBe('> ')
  })

  it('handles default maxHistory of 100', () => {
    const session = new ReplSession()
    for (let i = 0; i < 105; i++) session.addToHistory(`cmd-${i}`)
    expect(session.getHistory()).toHaveLength(100)
    expect(session.getHistory()[99]).toBe('cmd-104')
  })
})

// ── detectStack ──────────────────────────────────────────────────────────────

describe('detectStack', () => {
  it('detects npm stack for project with package.json + lock file', () => {
    const result = detectStack(process.cwd())
    expect(result.stack).toBe('npm')
    expect(result.confidence).toBe(1)
    expect(result.evidence).toContain('package.json')
  })

  it('throws McpGraphError for non-existent directory', () => {
    expect(() => detectStack('/tmp/__nonexistent_dir_xyz__')).toThrow()
  })

  it('returns npm with confidence 0.5 when only package.json present (no lock)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-test-'))
    try {
      writeFileSync(join(dir, 'package.json'), '{}')
      const result = detectStack(dir)
      expect(result.stack).toBe('npm')
      expect(result.confidence).toBe(0.5)
      expect(result.evidence).toContain('package.json')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('detects go stack when go.mod is present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-test-'))
    try {
      writeFileSync(join(dir, 'go.mod'), 'module example.com/test\n')
      const result = detectStack(dir)
      expect(result.stack).toBe('go')
      expect(result.confidence).toBe(0.5)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('detects go stack with higher confidence when go.sum is also present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-test-'))
    try {
      writeFileSync(join(dir, 'go.mod'), 'module example.com/test\n')
      writeFileSync(join(dir, 'go.sum'), '')
      const result = detectStack(dir)
      expect(result.stack).toBe('go')
      expect(result.confidence).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns auto with zero confidence for empty directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-test-'))
    try {
      const result = detectStack(dir)
      expect(result.stack).toBe('auto')
      expect(result.confidence).toBe(0)
      expect(result.evidence).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('prefers npm over pip when both package.json and requirements.txt exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-test-'))
    try {
      writeFileSync(join(dir, 'package.json'), '{}')
      writeFileSync(join(dir, 'requirements.txt'), 'flask\n')
      const result = detectStack(dir)
      expect(result.stack).toBe('npm')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
