import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { STORE_DIR } from '../core/utils/constants.js'
import { readHarnessScore, writeCompletionMemory } from '../cli/commands/done-completion-memory.js'

describe('done-completion-memory (extracted SRP+DRY helpers)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-completion-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const memPath = (name: string): string => join(dir, STORE_DIR, 'memories', `${name}.md`)

  describe('writeCompletionMemory', () => {
    it('writes task-<id>.md with the default DoD note and returns the memory name', () => {
      const name = writeCompletionMemory(dir, 'node_abc', 'My Task')

      expect(name).toBe('task-node_abc')
      const content = readFileSync(memPath('task-node_abc'), 'utf-8')
      expect(content).toContain('# My Task')
      expect(content).toContain('Task `node_abc` completed (DoD passed).')
    })

    it('honors a custom note (delegated-submit message) without changing the default', () => {
      const name = writeCompletionMemory(
        dir,
        'node_xyz',
        'Delegated',
        'Task `node_xyz` concluída via modo delegado (agf submit).',
      )

      expect(name).toBe('task-node_xyz')
      const content = readFileSync(memPath('task-node_xyz'), 'utf-8')
      expect(content).toContain('concluída via modo delegado (agf submit).')
      expect(content).not.toContain('DoD passed')
    })

    it('creates the memories directory if it does not exist', () => {
      expect(existsSync(join(dir, STORE_DIR, 'memories'))).toBe(false)
      writeCompletionMemory(dir, 'node_1', 'T')
      expect(existsSync(join(dir, STORE_DIR, 'memories'))).toBe(true)
    })
  })

  describe('readHarnessScore', () => {
    it('returns null when the memory file is absent', () => {
      expect(readHarnessScore(dir, 'missing-mem')).toBeNull()
    })

    it('parses a numeric score from the memory content', () => {
      mkdirSync(join(dir, STORE_DIR, 'memories'), { recursive: true })
      writeFileSync(memPath('harness-mem'), 'some text {"score": 87.5, "grade": "A"}', 'utf-8')
      expect(readHarnessScore(dir, 'harness-mem')).toBe(87.5)
    })

    it('returns null when no score field is present (malformed)', () => {
      mkdirSync(join(dir, STORE_DIR, 'memories'), { recursive: true })
      writeFileSync(memPath('no-score'), 'no numbers here', 'utf-8')
      expect(readHarnessScore(dir, 'no-score')).toBeNull()
    })
  })
})
