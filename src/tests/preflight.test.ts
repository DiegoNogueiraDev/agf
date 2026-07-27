/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  computePreflightVerdict,
  runPreflight,
  type PreflightInputs,
  type GitProbe,
  type GraphProbe,
  type DedupeHit,
} from '../core/preflight/preflight.js'

const cleanGit = {
  branch: 'main',
  ahead: 0,
  behind: 0,
  dirtyCount: 0,
  stashCount: 0,
  recentMatches: [] as Array<{ hash: string; subject: string }>,
}

function inputs(over: Partial<PreflightInputs>): PreflightInputs {
  return { git: cleanGit, dedupeHits: [], wipNodes: [], ...over }
}

describe('computePreflightVerdict', () => {
  it('returns "safe" with no findings on a clean tree and no duplicates', () => {
    const r = computePreflightVerdict(inputs({}))
    expect(r.verdict).toBe('safe')
    expect(r.findings).toEqual([])
  })

  it('returns "wip-conflict" when a duplicate node is in_progress (golden rule)', () => {
    const hit: DedupeHit = { id: 'node_x', title: 'Session composite type', status: 'in_progress', score: 9 }
    const r = computePreflightVerdict(inputs({ dedupeHits: [hit] }))
    expect(r.verdict).toBe('wip-conflict')
    expect(r.findings.join('\n')).toContain('node_x')
  })

  it('returns "duplicate-risk" when a duplicate exists in done/backlog (no in_progress)', () => {
    const hits: DedupeHit[] = [
      { id: 'node_done', title: 'HTN planner', status: 'done', score: 7 },
      { id: 'node_bk', title: 'HTN planner v2', status: 'backlog', score: 6 },
    ]
    const r = computePreflightVerdict(inputs({ dedupeHits: hits }))
    expect(r.verdict).toBe('duplicate-risk')
    expect(r.findings.length).toBeGreaterThanOrEqual(2)
  })

  it('returns "dirty-tree" when no dups but tree has unpushed/uncommitted work', () => {
    const r = computePreflightVerdict(inputs({ git: { ...cleanGit, ahead: 1, dirtyCount: 3 } }))
    expect(r.verdict).toBe('dirty-tree')
    expect(r.findings.join('\n')).toMatch(/não pushado|não-commitado/)
  })

  it('wip-conflict outranks dirty-tree (severity precedence)', () => {
    const hit: DedupeHit = { id: 'n', title: 't', status: 'in_progress', score: 5 }
    const r = computePreflightVerdict(inputs({ dedupeHits: [hit], git: { ...cleanGit, dirtyCount: 9 } }))
    expect(r.verdict).toBe('wip-conflict')
  })

  it('surfaces behind-origin and stash as findings even when verdict stays safe-ish', () => {
    const r = computePreflightVerdict(inputs({ git: { ...cleanGit, behind: 2, stashCount: 1 } }))
    expect(r.findings.join('\n')).toMatch(/atrás do origin/)
    expect(r.findings.join('\n')).toMatch(/stash/)
  })
})

describe('runPreflight (port composition)', () => {
  const stubGit: GitProbe = {
    aheadBehind: () => ({ ahead: 0, behind: 0 }),
    stashCount: () => 0,
    dirtyCount: () => 0,
    branch: () => 'main',
    commitsMatching: () => [],
  }

  it('excludes the node itself from duplicate hits', () => {
    const graph: GraphProbe = {
      findDuplicates: () => [
        { id: 'self', title: 'me', status: 'in_progress', score: 9 },
        { id: 'other', title: 'dup', status: 'done', score: 8 },
      ],
      listWip: () => [],
    }
    const report = runPreflight({ topic: 'me', nodeId: 'self', git: stubGit, graph })
    expect(report.dedupeHits.map((h) => h.id)).toEqual(['other'])
    expect(report.verdict).toBe('duplicate-risk')
  })

  it('reports WIP nodes and maps git probe output into the report', () => {
    const graph: GraphProbe = {
      findDuplicates: () => [],
      listWip: () => [{ id: 'wip1', title: 'in flight' }],
    }
    const git: GitProbe = { ...stubGit, aheadBehind: () => ({ ahead: 2, behind: 0 }) }
    const report = runPreflight({ topic: 'something new', git, graph })
    expect(report.wipNodes).toHaveLength(1)
    expect(report.git.ahead).toBe(2)
    expect(report.verdict).toBe('dirty-tree')
  })

  it('handles a null/empty topic by skipping dedupe (verdict from git only)', () => {
    const graph: GraphProbe = {
      findDuplicates: () => {
        throw new Error('should not be called when topic is empty')
      },
      listWip: () => [],
    }
    const report = runPreflight({ topic: null, git: stubGit, graph })
    expect(report.dedupeHits).toEqual([])
    expect(report.verdict).toBe('safe')
  })
})
