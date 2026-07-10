/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * B1 — Rubric/goal primitive: a gradable RUBRIC of pass/fail criteria,
 * attachable to a graph node or autopilot session. Grades the OBJECTIVE's
 * end-state (distinct from per-task DoD). The independent LLM grader is B2;
 * here we only cover the data primitive + deterministic evaluation + attach/read.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode } from '../core/graph/graph-types.js'
import {
  buildRubric,
  evaluateCriterion,
  evaluateRubric,
  attachRubric,
  readRubric,
  type Rubric,
  type RubricCriterion,
} from '../core/autonomy/rubric.js'

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  const now = new Date().toISOString()
  return {
    id: overrides.id ?? 'node_test',
    type: overrides.type ?? 'task',
    title: overrides.title ?? 'Test node',
    status: overrides.status ?? 'backlog',
    priority: overrides.priority ?? 3,
    metadata: overrides.metadata ?? {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('buildRubric (AC 1 — persist N criteria, each with a pass/fail spec)', () => {
  it('builds a rubric from plain AC strings as llm criteria with stable ids', () => {
    const rubric = buildRubric(['The CLI prints help', 'The exit code is zero'])

    expect(rubric.criteria).toHaveLength(2)
    expect(rubric.criteria[0]).toMatchObject({ id: 'c1', kind: 'llm', description: 'The CLI prints help' })
    expect(rubric.criteria[1]).toMatchObject({ id: 'c2', kind: 'llm', description: 'The exit code is zero' })
    expect(rubric.criteria[0].pattern).toBeUndefined()
  })

  it('builds deterministic criteria from structured specs carrying a pattern', () => {
    const rubric = buildRubric([
      { description: 'output mentions success', kind: 'deterministic', pattern: 'SUCCESS' },
      { description: 'free-form quality', kind: 'llm' },
    ])

    expect(rubric.criteria[0]).toMatchObject({ id: 'c1', kind: 'deterministic', pattern: 'SUCCESS' })
    expect(rubric.criteria[1]).toMatchObject({ id: 'c2', kind: 'llm' })
    expect(rubric.criteria[1].pattern).toBeUndefined()
  })

  it('infers a deterministic criterion from an inline pattern in a bare string', () => {
    const rubric = buildRubric(['must contain pattern:/v\\d+\\.\\d+/'])

    expect(rubric.criteria[0].kind).toBe('deterministic')
    expect(rubric.criteria[0].pattern).toBe('/v\\d+\\.\\d+/')
  })

  it('assigns stable, unique ids across many criteria', () => {
    const rubric = buildRubric(['a', 'b', 'c', 'd', 'e'])
    const ids = rubric.criteria.map((c) => c.id)
    expect(ids).toEqual(['c1', 'c2', 'c3', 'c4', 'c5'])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('seeds a rubric from a node acceptanceCriteria array (reuses AC shape)', () => {
    const node = makeNode({ acceptanceCriteria: ['AC one', 'AC two'] })
    const rubric = buildRubric(node.acceptanceCriteria ?? [])
    expect(rubric.criteria).toHaveLength(2)
    expect(rubric.criteria.map((c) => c.description)).toEqual(['AC one', 'AC two'])
  })
})

describe('evaluateCriterion (AC 2 — deterministic criterion evaluates with ZERO LLM)', () => {
  it('passes a deterministic substring criterion when the output contains the pattern', () => {
    const c: RubricCriterion = { id: 'c1', description: 'has success', kind: 'deterministic', pattern: 'SUCCESS' }
    const r = evaluateCriterion(c, 'build SUCCESS, all green')
    expect(r).toEqual({ id: 'c1', kind: 'deterministic', passed: true })
  })

  it('fails a deterministic criterion when the pattern is absent', () => {
    const c: RubricCriterion = { id: 'c1', description: 'has success', kind: 'deterministic', pattern: 'SUCCESS' }
    const r = evaluateCriterion(c, 'build FAILED')
    expect(r.passed).toBe(false)
  })

  it('treats a /.../ pattern as a regex', () => {
    const c: RubricCriterion = { id: 'c1', description: 'semver', kind: 'deterministic', pattern: '/v\\d+\\.\\d+/' }
    expect(evaluateCriterion(c, 'released v1.2 today').passed).toBe(true)
    expect(evaluateCriterion(c, 'released vX.Y today').passed).toBe(false)
  })

  it('returns passed:null for an llm criterion (deferred to the B2 grader)', () => {
    const c: RubricCriterion = { id: 'c1', description: 'feels polished', kind: 'llm' }
    const r = evaluateCriterion(c, 'anything')
    expect(r).toEqual({ id: 'c1', kind: 'llm', passed: null })
  })

  it('fails a deterministic criterion with no usable pattern rather than guessing', () => {
    const c: RubricCriterion = { id: 'c1', description: 'broken', kind: 'deterministic' }
    expect(evaluateCriterion(c, 'whatever').passed).toBe(false)
  })
})

describe('evaluateRubric (aggregate — deterministic with zero LLM, llm pending)', () => {
  it('reports deterministicAllPass and the pending llm criteria', () => {
    const rubric = buildRubric([
      { description: 'has OK', kind: 'deterministic', pattern: 'OK' },
      { description: 'has DONE', kind: 'deterministic', pattern: 'DONE' },
      { description: 'subjective quality', kind: 'llm' },
    ])

    const result = evaluateRubric(rubric, 'status: OK; phase: DONE')
    expect(result.results).toHaveLength(3)
    expect(result.deterministicAllPass).toBe(true)
    expect(result.pending).toHaveLength(1)
    expect(result.pending[0].kind).toBe('llm')
  })

  it('marks deterministicAllPass false when any deterministic criterion fails', () => {
    const rubric = buildRubric([
      { description: 'has OK', kind: 'deterministic', pattern: 'OK' },
      { description: 'has DONE', kind: 'deterministic', pattern: 'DONE' },
    ])
    const result = evaluateRubric(rubric, 'status: OK only')
    expect(result.deterministicAllPass).toBe(false)
    expect(result.pending).toHaveLength(0)
  })

  it('deterministicAllPass is true (vacuously) when there are no deterministic criteria', () => {
    const rubric = buildRubric([{ description: 'subjective', kind: 'llm' }])
    const result = evaluateRubric(rubric, 'x')
    expect(result.deterministicAllPass).toBe(true)
    expect(result.pending).toHaveLength(1)
  })
})

describe('attachRubric / readRubric (AC 3 — attach to a node and retrieve)', () => {
  it('round-trips a rubric through node metadata (pure)', () => {
    const node = makeNode()
    const rubric = buildRubric([{ description: 'ok', kind: 'deterministic', pattern: 'OK' }, 'subjective'])

    const attached = attachRubric(node, rubric)
    const read = readRubric(attached)

    expect(read).toEqual(rubric)
  })

  it('does not mutate the input node (purity)', () => {
    const node = makeNode({ metadata: { origin: 'seed' } })
    const rubric = buildRubric(['x'])
    const attached = attachRubric(node, rubric)

    expect(node.metadata?.rubric).toBeUndefined()
    expect(attached).not.toBe(node)
    expect(attached.metadata?.origin).toBe('seed') // preserves existing metadata
  })

  it('returns null when a node has no rubric attached', () => {
    expect(readRubric(makeNode())).toBeNull()
    expect(readRubric(makeNode({ metadata: undefined }))).toBeNull()
  })
})

describe('SqliteStore round-trip (AC 1 + AC 3 — real persistence)', () => {
  let store: SqliteStore

  beforeEach(async () => {
    store = await SqliteStore.open(':memory:')
    store.initProject('rubric-test')
  })

  afterEach(() => {
    store.close()
  })

  it('persists an attached rubric and retrieves it after a store reload', () => {
    const rubric: Rubric = buildRubric([
      { description: 'output has GREEN', kind: 'deterministic', pattern: 'GREEN' },
      'overall objective satisfied',
    ])
    const node = attachRubric(makeNode({ id: 'node_rubric_1' }), rubric)

    store.insertNode(node)

    const loaded = store.getNodeById('node_rubric_1')
    expect(loaded).not.toBeNull()
    const readBack = readRubric(loaded as GraphNode)
    expect(readBack).toEqual(rubric)

    // and the deterministic part is gradable with zero LLM straight off the store
    const evald = evaluateRubric(readBack as Rubric, 'tests GREEN')
    expect(evald.deterministicAllPass).toBe(true)
    expect(evald.pending).toHaveLength(1)
  })
})
