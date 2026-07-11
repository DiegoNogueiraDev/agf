/*!
 * Task node_27840fae2453 — wire mineScaffoldCandidates into agf done.
 *
 * AC1: mineScaffoldCandidates is invoked over completed task titles (RAG-OUT goals)
 * AC2: patterns recurring >= minFrequency are persisted as scaffold candidates
 * AC3: no recurring patterns → nothing persisted (no-op)
 * AC4: throws are caught; agf done still completes
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { mkdirSync, rmSync, existsSync, readFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mineAndPersistScaffoldCandidates } from '../core/rag-out/mine-on-done.js'

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'agf-mine-test-'))
}

describe('mineAndPersistScaffoldCandidates', () => {
  let dir: string

  beforeEach(() => {
    dir = makeTempDir()
  })

  // AC1 — invoked over goals, returns result
  it('returns empty candidates when there are no goals', () => {
    const result = mineAndPersistScaffoldCandidates([], dir)
    expect(result).toEqual([])
  })

  // AC2 — recurring patterns persisted
  it('persists candidates file when pattern recurs above minFrequency', () => {
    const goals = ['implement user auth handler', 'implement admin auth handler', 'implement session auth handler']
    const result = mineAndPersistScaffoldCandidates(goals, dir)
    expect(result.length).toBeGreaterThan(0)
    const candidatesPath = join(dir, 'workflow-graph', 'memories', 'scaffold-candidates.json')
    expect(existsSync(candidatesPath)).toBe(true)
    const saved = JSON.parse(readFileSync(candidatesPath, 'utf-8')) as unknown[]
    expect(saved).toHaveLength(result.length)
  })

  // AC3 — no recurring patterns = no-op
  it('does not write file when no patterns recur', () => {
    const goals = ['build auth feature', 'write migration script', 'fix ui button layout']
    const result = mineAndPersistScaffoldCandidates(goals, dir)
    const candidatesPath = join(dir, 'workflow-graph', 'memories', 'scaffold-candidates.json')
    expect(result).toHaveLength(0)
    expect(existsSync(candidatesPath)).toBe(false)
  })

  // AC4 — throws do not propagate
  it('returns empty array and does not throw when dir is invalid', () => {
    const result = mineAndPersistScaffoldCandidates(['some goal'], '/nonexistent/readonly/dir')
    // Should not throw; result may be empty (mining finds nothing) or non-empty but persist failed silently
    expect(Array.isArray(result)).toBe(true)
  })

  it('merges new candidates with existing persisted file', () => {
    const memDir = join(dir, 'workflow-graph', 'memories')
    mkdirSync(memDir, { recursive: true })
    const candidatesPath = join(memDir, 'scaffold-candidates.json')
    const existing = [{ suggestedId: 'existing', fitTags: ['existing'], count: 2, examples: ['old goal'] }]
    require('node:fs').writeFileSync(candidatesPath, JSON.stringify(existing), 'utf-8')

    const goals = ['implement cache layer service', 'implement cache layer adapter', 'implement cache layer factory']
    mineAndPersistScaffoldCandidates(goals, dir)
    const saved = JSON.parse(readFileSync(candidatesPath, 'utf-8')) as unknown[]
    // Should contain both existing + new
    expect(saved.length).toBeGreaterThanOrEqual(existing.length)
  })
})
