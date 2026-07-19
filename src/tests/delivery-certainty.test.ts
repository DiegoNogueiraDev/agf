/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * Tests for computeDeliveryCertainty (node_19809e400130, epic node_7deb314e81b0).
 * The pure composer fuses the honesty signals (code/test on disk, consumer-proof,
 * blockers + soft DoD/FPY/harness) into ONE verdict with a band + confidence and
 * the means (pillars) rendered. Any HARD pillar red ⇒ PROVEN_INCOMPLETE.
 */

import { describe, it, expect } from 'vitest'
import { computeDeliveryCertainty } from '../core/certainty/delivery-certainty.js'
import type { GraphDocument, GraphNode, GraphEdge } from '../core/graph/graph-types.js'

function makeDoc(nodes: GraphNode[] = [], edges: GraphEdge[] = []): GraphDocument {
  return {
    version: '1.0',
    project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
    nodes,
    edges,
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

function node(id: string, over: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    type: 'task',
    title: `task ${id}`,
    status: 'in_progress',
    priority: 3,
    createdAt: '',
    updatedAt: '',
    ...over,
  }
}

const PROOF = { command: 'agf certainty demo', evidence: 'ran on CLI, band=PROVEN' }
/** A fully-green fixture: impl+test on disk, valid proof, no blockers. */
function greenNode(id = 'n1'): GraphNode {
  return node(id, {
    implementationFiles: ['src/x.ts'],
    testFiles: ['src/tests/x.test.ts'],
    metadata: { consumerProof: PROOF },
  })
}
const existsAll = () => true

describe('computeDeliveryCertainty', () => {
  it('all hard pillars green → PROVEN, confidence ≥ 95, and 7 pillars rendered', () => {
    const doc = makeDoc([greenNode()])
    const r = computeDeliveryCertainty(doc, 'n1', { fileExists: existsAll })
    expect(r.band).toBe('PROVEN')
    expect(r.confidence).toBeGreaterThanOrEqual(95)
    expect(r.pillars).toHaveLength(7)
    expect(r.pillars.every((p) => typeof p.source === 'string' && p.source.length > 0)).toBe(true)
    expect(r.blockingPillars).toEqual([])
  })

  it('a declared testFile missing on disk → PROVEN_INCOMPLETE, test_on_disk red with the missing path as source', () => {
    const doc = makeDoc([greenNode()])
    const fileExists = (p: string) => p !== 'src/tests/x.test.ts'
    const r = computeDeliveryCertainty(doc, 'n1', { fileExists })
    expect(r.band).toBe('PROVEN_INCOMPLETE')
    const test = r.pillars.find((p) => p.key === 'test_on_disk')!
    expect(test.state).toBe('red')
    expect(test.source).toContain('src/tests/x.test.ts')
    expect(r.blockingPillars).toContain('test_on_disk')
  })

  it('missing implementationFile on disk → code_on_disk red, PROVEN_INCOMPLETE', () => {
    const doc = makeDoc([greenNode()])
    const fileExists = (p: string) => p !== 'src/x.ts'
    const r = computeDeliveryCertainty(doc, 'n1', { fileExists })
    expect(r.pillars.find((p) => p.key === 'code_on_disk')!.state).toBe('red')
    expect(r.band).toBe('PROVEN_INCOMPLETE')
  })

  it('no consumerProof → consumer_proof red and in blockingPillars', () => {
    const n = node('n1', { implementationFiles: ['src/x.ts'], testFiles: ['src/tests/x.test.ts'] })
    const r = computeDeliveryCertainty(makeDoc([n]), 'n1', { fileExists: existsAll })
    expect(r.pillars.find((p) => p.key === 'consumer_proof')!.state).toBe('red')
    expect(r.blockingPillars).toContain('consumer_proof')
    expect(r.band).toBe('PROVEN_INCOMPLETE')
  })

  it('consumerProof with result=failed → consumer_proof red (a failed proof is not proof)', () => {
    const n = node('n1', {
      implementationFiles: ['src/x.ts'],
      testFiles: ['src/tests/x.test.ts'],
      metadata: { consumerProof: { command: 'agf x', evidence: 'e', result: 'failed' } },
    })
    const r = computeDeliveryCertainty(makeDoc([n]), 'n1', { fileExists: existsAll })
    expect(r.pillars.find((p) => p.key === 'consumer_proof')!.state).toBe('red')
  })

  it('unresolved depends_on blocker → no_blockers red', () => {
    const target = greenNode('n1')
    const dep = node('dep', { status: 'backlog' })
    const edge: GraphEdge = {
      id: 'e1',
      from: 'n1',
      to: 'dep',
      relationType: 'depends_on',
      createdAt: '',
    }
    const r = computeDeliveryCertainty(makeDoc([target, dep], [edge]), 'n1', { fileExists: existsAll })
    expect(r.pillars.find((p) => p.key === 'no_blockers')!.state).toBe('red')
    expect(r.blockingPillars).toContain('no_blockers')
  })

  it('node declares neither implementation nor test files → UNKNOWN, confidence 0', () => {
    const n = node('n1', { metadata: { consumerProof: PROOF } })
    const r = computeDeliveryCertainty(makeDoc([n]), 'n1', { fileExists: existsAll })
    expect(r.band).toBe('UNKNOWN')
    expect(r.confidence).toBe(0)
  })

  it('every pillar carries a non-empty rationale (the means are explicit, not invented downstream)', () => {
    const r = computeDeliveryCertainty(makeDoc([greenNode()]), 'n1', { fileExists: existsAll })
    expect(r.pillars.every((p) => typeof p.rationale === 'string' && p.rationale.length > 0)).toBe(true)
  })

  it('test_on_disk stays red when files exist but lastOutcome=failure (existence ≠ passing)', () => {
    const r = computeDeliveryCertainty(makeDoc([greenNode()]), 'n1', {
      fileExists: existsAll,
      lastOutcome: 'failure',
    })
    expect(r.pillars.find((p) => p.key === 'test_on_disk')!.state).toBe('red')
  })
})
