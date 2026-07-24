/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * Tests for `agf certainty --explain` (node_138a23eaa5f0, épico node_7deb314e81b0).
 * O usuário pediu "deixar muito claro os MEIOS": cada pilar precisa dizer O QUE
 * mede, QUAL a fonte e POR QUE torna o done confiável. Sem node válido, explica
 * o MODELO genérico — nunca crasha por ausência de dado.
 * Fonte única: o catálogo de pilares é o mesmo que o composer usa (sem drift).
 */

import { describe, it, expect } from 'vitest'
import { explainCertaintyModel, explainCertainty } from '../core/certainty/explain-certainty.js'
import { computeDeliveryCertainty, PILLAR_KEYS } from '../core/certainty/delivery-certainty.js'
import type { GraphDocument, GraphNode } from '../core/graph/graph-types.js'

function makeDoc(nodes: GraphNode[]): GraphDocument {
  return {
    version: '1.0',
    project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
    nodes,
    edges: [],
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

const node: GraphNode = {
  id: 'n1',
  type: 'task',
  title: 't',
  status: 'in_progress',
  priority: 3,
  createdAt: '',
  updatedAt: '',
  implementationFiles: ['src/x.ts'],
  testFiles: ['src/tests/x.test.ts'],
  metadata: { consumerProof: { command: 'agf x', evidence: 'e' } },
}

describe('explainCertaintyModel (generic — no node needed)', () => {
  it('explains all 7 pillars', () => {
    expect(explainCertaintyModel()).toHaveLength(7)
  })

  it('every pillar states what it measures, its source and WHY it makes done trustworthy', () => {
    for (const e of explainCertaintyModel()) {
      expect(e.measures.length).toBeGreaterThan(0)
      expect(e.source.length).toBeGreaterThan(0)
      expect(e.rationale.length).toBeGreaterThan(0)
      expect(['hard', 'soft']).toContain(e.kind)
    }
  })

  it('covers exactly the pillar keys the composer emits (single source, no drift)', () => {
    const explained = explainCertaintyModel()
      .map((e) => e.key)
      .sort()
    expect(explained).toEqual([...PILLAR_KEYS].sort())
  })
})

describe('explainCertainty (node-specific)', () => {
  it('merges the live state and detail onto each explained pillar', () => {
    const certainty = computeDeliveryCertainty(makeDoc([node]), 'n1', { fileExists: () => true })
    const rows = explainCertainty(certainty)
    expect(rows).toHaveLength(7)
    const code = rows.find((r) => r.key === 'code_on_disk')!
    expect(code.state).toBe('green')
    expect(code.rationale.length).toBeGreaterThan(0)
    expect(code.detail.length).toBeGreaterThan(0)
  })

  it('rationale matches what the composer already emits (no divergent copy)', () => {
    const certainty = computeDeliveryCertainty(makeDoc([node]), 'n1', { fileExists: () => true })
    const rows = explainCertainty(certainty)
    for (const p of certainty.pillars) {
      expect(rows.find((r) => r.key === p.key)!.rationale).toBe(p.rationale)
    }
  })

  it('a red pillar keeps its red state in the explanation (explain never hides a failure)', () => {
    const certainty = computeDeliveryCertainty(makeDoc([node]), 'n1', {
      fileExists: (p: string) => p !== 'src/tests/x.test.ts',
    })
    const rows = explainCertainty(certainty)
    expect(rows.find((r) => r.key === 'test_on_disk')!.state).toBe('red')
  })
})
