/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * DoD check #14 (consumer_proof) — Rule 16: every delivery must prove value
 * + behavior in the consumer's real mode. Recommended severity: flags tasks
 * with no consumerProof evidence without blocking the gate.
 */
import { describe, it, expect } from 'vitest'
import { checkDefinitionOfDone } from '../core/implementer/definition-of-done.js'
import type { GraphNode, GraphEdge } from '../core/graph/graph-types.js'

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  const ts = new Date().toISOString()
  return {
    id: 'node_test',
    type: 'task',
    title: 'Test Node',
    status: 'in_progress',
    priority: 3,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  }
}

function makeDoc(nodes: GraphNode[], edges: GraphEdge[] = []) {
  return {
    version: '1.0.0',
    project: { id: 'proj_test', name: 'Test', createdAt: new Date().toISOString() },
    nodes,
    edges,
    indexes: { byId: {} },
    meta: {},
  }
}

describe('DoD consumer_proof check', () => {
  it('PASSES recommended when consumerProof has command and evidence', () => {
    const node = makeNode({
      status: 'in_progress',
      acceptanceCriteria: ['AC1'],
      metadata: {
        consumerProof: { command: 'npm run dev -- check node_1', evidence: 'screenshot: node_1 green.png' },
      },
    })
    const doc = makeDoc([node])
    const result = checkDefinitionOfDone(doc, node.id)
    const check = result.checks.find((c) => c.name === 'consumer_proof')
    expect(check?.passed).toBe(true)
    expect(check?.severity).toBe('recommended')
  })

  it('FAILS recommended when consumerProof is absent', () => {
    const node = makeNode({ status: 'in_progress', acceptanceCriteria: ['AC1'] })
    const doc = makeDoc([node])
    const result = checkDefinitionOfDone(doc, node.id)
    const check = result.checks.find((c) => c.name === 'consumer_proof')
    expect(check?.passed).toBe(false)
    expect(check?.severity).toBe('recommended')
  })

  it('FAILS gracefully for malformed consumerProof (empty command)', () => {
    const node = makeNode({
      status: 'in_progress',
      acceptanceCriteria: ['AC1'],
      metadata: {
        consumerProof: { command: '', evidence: 'screenshot.png' },
      },
    })
    const doc = makeDoc([node])
    const result = checkDefinitionOfDone(doc, node.id)
    const check = result.checks.find((c) => c.name === 'consumer_proof')
    expect(check?.passed).toBe(false)
    expect(check?.details).toBeTruthy()
  })

  it('FAILS gracefully for consumerProof without evidence field', () => {
    const node = makeNode({
      status: 'in_progress',
      acceptanceCriteria: ['AC1'],
      metadata: {
        consumerProof: { command: 'npm run dev -- check node_1' },
      },
    })
    const doc = makeDoc([node])
    const result = checkDefinitionOfDone(doc, node.id)
    const check = result.checks.find((c) => c.name === 'consumer_proof')
    expect(check?.passed).toBe(false)
  })
})
