/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * Tests for detect-phantom-done — the anti-hallucination triangulation detector.
 * A `done` task whose declared testFiles do NOT exist on disk is a phantom
 * delivery: the graph claims done, but no real test backs it.
 */

import { describe, it, expect } from 'vitest'
import { detectPhantomDone, missingFiles } from '../core/gaps/detect-phantom-done.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeDoc(nodes: GraphDocument['nodes'] = []): GraphDocument {
  return {
    version: '1.0',
    project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
    nodes,
    edges: [],
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

function task(
  id: string,
  status: string,
  testFiles?: string[],
  implementationFiles?: string[],
): GraphDocument['nodes'][number] {
  return {
    id,
    type: 'task',
    title: `task ${id}`,
    status: status as GraphDocument['nodes'][number]['status'],
    priority: 3,
    createdAt: '',
    updatedAt: '',
    ...(testFiles ? { testFiles } : {}),
    ...(implementationFiles ? { implementationFiles } : {}),
  }
}

const existsAll = (): boolean => true
const existsNone = (): boolean => false

describe('detectPhantomDone', () => {
  it('done task with a testFile that does NOT exist on disk → required phantom_done gap', () => {
    const doc = makeDoc([task('t1', 'done', ['src/tests/ghost.test.ts'])])
    const gaps = detectPhantomDone(doc, existsNone)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].kind).toBe('phantom_done')
    expect(gaps[0].severity).toBe('required')
    expect(gaps[0].nodeId).toBe('t1')
    expect(gaps[0].evidence).toContain('src/tests/ghost.test.ts')
  })

  it('done task whose testFiles all exist → no gap (no false positive)', () => {
    const doc = makeDoc([task('t1', 'done', ['src/tests/real.test.ts'])])
    expect(detectPhantomDone(doc, existsAll)).toEqual([])
  })

  it('non-done task with missing testFiles → ignored (only audits delivered work)', () => {
    const doc = makeDoc([task('t1', 'backlog', ['src/tests/ghost.test.ts'])])
    expect(detectPhantomDone(doc, existsNone)).toEqual([])
  })

  it('done task with no testFiles declared → not a phantom (separate DoD concern)', () => {
    const doc = makeDoc([task('t1', 'done')])
    expect(detectPhantomDone(doc, existsNone)).toEqual([])
  })

  it('reports each missing file in the evidence', () => {
    const doc = makeDoc([task('t1', 'done', ['a.test.ts', 'b.test.ts'])])
    const gaps = detectPhantomDone(doc, (p) => p === 'a.test.ts')
    expect(gaps).toHaveLength(1)
    expect(gaps[0].evidence).toContain('b.test.ts')
    expect(gaps[0].evidence).not.toContain('a.test.ts')
  })

  it('empty doc → empty array', () => {
    expect(detectPhantomDone(makeDoc(), existsNone)).toEqual([])
  })

  it('done task with an implementationFile that does NOT exist → phantom_done (code axis)', () => {
    const doc = makeDoc([task('t1', 'done', undefined, ['src/core/ghost.ts'])])
    const gaps = detectPhantomDone(doc, existsNone)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].kind).toBe('phantom_done')
    expect(gaps[0].evidence).toContain('src/core/ghost.ts')
  })

  it('done task with both test and impl files present → no gap', () => {
    const doc = makeDoc([task('t1', 'done', ['real.test.ts'], ['src/core/real.ts'])])
    expect(detectPhantomDone(doc, existsAll)).toEqual([])
  })

  it('reports missing files from BOTH axes in the evidence', () => {
    const doc = makeDoc([task('t1', 'done', ['ghost.test.ts'], ['src/core/ghost.ts'])])
    const gaps = detectPhantomDone(doc, existsNone)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].evidence).toContain('ghost.test.ts')
    expect(gaps[0].evidence).toContain('src/core/ghost.ts')
  })

  // node_e88c71acceb3 — the detector is type-agnostic (checks status:done on
  // ANY node), so an acceptance_criteria node with no implementationFiles must
  // be caught the same way a task is, and one WITH real files must not.
  it('an acceptance_criteria node marked done with no implementationFiles → detected', () => {
    const doc = makeDoc([{ ...task('ac1', 'done'), type: 'acceptance_criteria', implementationFiles: ['ghost.ts'] }])
    const gaps = detectPhantomDone(doc, existsNone)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].kind).toBe('phantom_done')
  })

  it('an acceptance_criteria node marked done with real implementationFiles → not reported', () => {
    const doc = makeDoc([{ ...task('ac2', 'done'), type: 'acceptance_criteria', implementationFiles: ['real.ts'] }])
    expect(detectPhantomDone(doc, existsAll)).toEqual([])
  })
})

describe('missingFiles (shared helper — reused by detector and done-gate, both axes)', () => {
  it('returns the files that fail the existence probe', () => {
    expect(missingFiles(['a.test.ts', 'b.test.ts'], (p) => p === 'a.test.ts')).toEqual(['b.test.ts'])
  })

  it('returns [] when all files exist', () => {
    expect(missingFiles(['a.test.ts'], existsAll)).toEqual([])
  })

  it('returns [] for an empty list', () => {
    expect(missingFiles([], existsNone)).toEqual([])
  })
})
