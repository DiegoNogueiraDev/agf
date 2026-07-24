/*!
 * Task node_8c01deba8586 — persist extractFacts via formatFactsAsMemory on done.
 *
 * AC1: after session, accumulated facts are persisted cross-process
 * AC2: facts retrievable in later session (file exists on disk)
 * AC3: no facts → nothing written
 * AC4: throws do not propagate
 */

import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resetFacts, pushFact } from '../core/hooks/context-injection.js'
import { persistAccumulatedFacts } from '../core/hooks/persist-extracted-facts.js'

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'agf-facts-test-'))
}

describe('persistAccumulatedFacts', () => {
  afterEach(() => resetFacts())

  it('writes nothing when no facts are accumulated (AC3)', () => {
    const dir = makeTempDir()
    persistAccumulatedFacts(dir)
    const memDir = join(dir, 'workflow-graph', 'memories')
    const written = existsSync(memDir) ? readdirSync(memDir).filter((f) => f.startsWith('extracted-facts')) : []
    expect(written).toHaveLength(0)
    rmSync(dir, { recursive: true })
  })

  it('writes a file when facts exist (AC1 + AC2)', () => {
    const dir = makeTempDir()
    pushFact('[error] Something failed (Bash @ 2026-01-01)')
    pushFact('[keyword] refactor (Edit @ 2026-01-01)')
    persistAccumulatedFacts(dir)
    const memDir = join(dir, 'workflow-graph', 'memories')
    expect(existsSync(memDir)).toBe(true)
    const files = readdirSync(memDir).filter((f) => f.startsWith('extracted-facts'))
    expect(files.length).toBeGreaterThan(0)
    rmSync(dir, { recursive: true })
  })

  it('does not throw when dir is invalid (AC4)', () => {
    pushFact('[error] test')
    expect(() => persistAccumulatedFacts('/nonexistent/invalid/path')).not.toThrow()
  })

  it('resets facts after persistence', () => {
    const dir = makeTempDir()
    pushFact('[decision] chose TypeScript')
    persistAccumulatedFacts(dir, { resetAfter: true })
    // After reset, second call should write nothing
    persistAccumulatedFacts(dir)
    const memDir = join(dir, 'workflow-graph', 'memories')
    const files = existsSync(memDir) ? readdirSync(memDir).filter((f) => f.startsWith('extracted-facts')) : []
    expect(files.length).toBe(1) // only from first call
    rmSync(dir, { recursive: true })
  })
})
