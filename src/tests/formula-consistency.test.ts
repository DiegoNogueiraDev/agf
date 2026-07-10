/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { analyzeFormulaConsistency } from '../core/analyzer/formula-consistency.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeGraphDoc(nodes: GraphDocument['nodes']): GraphDocument {
  return {
    version: '1',
    project: {
      id: 'test',
      name: 'test',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    nodes,
    edges: [],
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

describe('analyzeFormulaConsistency', () => {
  it('returns empty report when no formula nodes exist', () => {
    const doc = makeGraphDoc([
      { id: 'n1', type: 'task', title: 'Some task', status: 'backlog', priority: 3, createdAt: '', updatedAt: '' },
    ])
    const result = analyzeFormulaConsistency(doc)
    expect(result.totalFormulas).toBe(0)
    expect(result.validCount).toBe(0)
    expect(result.formulas).toEqual([])
    expect(result.conflicts).toEqual([])
  })

  it('validates a formula with complete metadata', () => {
    const doc = makeGraphDoc([
      {
        id: 'f1',
        type: 'formula',
        title: 'Tax Calculation',
        status: 'backlog',
        priority: 3,
        metadata: {
          expression: 'price * taxRate',
          inputs: ['price', 'taxRate'],
          outputs: ['totalPrice'],
          externalInputs: ['price', 'taxRate'],
        },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ])
    const result = analyzeFormulaConsistency(doc)
    expect(result.totalFormulas).toBe(1)
    expect(result.validCount).toBe(1)
    expect(result.formulas[0].valid).toBe(true)
    expect(result.formulas[0].issues).toEqual([])
  })

  it('flags missing expression, inputs, and outputs', () => {
    const doc = makeGraphDoc([
      {
        id: 'f1',
        type: 'formula',
        title: 'Broken Formula',
        status: 'backlog',
        priority: 3,
        metadata: {},
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ])
    const result = analyzeFormulaConsistency(doc)
    expect(result.validCount).toBe(0)
    expect(result.formulas[0].issues).toContain("Missing 'expression' in metadata")
    expect(result.formulas[0].issues).toContain("Missing 'inputs' in metadata")
    expect(result.formulas[0].issues).toContain("Missing 'outputs' in metadata")
  })

  it('flags unresolved inputs that no formula provides', () => {
    const doc = makeGraphDoc([
      {
        id: 'f1',
        type: 'formula',
        title: 'Needs Input',
        status: 'backlog',
        priority: 3,
        metadata: {
          expression: 'a + b',
          inputs: ['a', 'b'],
          outputs: ['c'],
        },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ])
    const result = analyzeFormulaConsistency(doc)
    expect(result.formulas[0].issues).toContain("Input 'a' is not provided by any formula output or declared external")
    expect(result.formulas[0].issues).toContain("Input 'b' is not provided by any formula output or declared external")
  })

  it('resolves inputs when another formula provides the output', () => {
    const doc = makeGraphDoc([
      {
        id: 'f1',
        type: 'formula',
        title: 'Provides A',
        status: 'backlog',
        priority: 3,
        metadata: {
          expression: '42',
          inputs: [],
          outputs: ['a'],
        },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'f2',
        type: 'formula',
        title: 'Uses A',
        status: 'backlog',
        priority: 3,
        metadata: {
          expression: 'a + 1',
          inputs: ['a'],
          outputs: ['b'],
        },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ])
    const result = analyzeFormulaConsistency(doc)
    expect(result.totalFormulas).toBe(2)
    expect(result.validCount).toBe(2)
    expect(result.formulas.every((f) => f.valid)).toBe(true)
  })

  it('resolves inputs declared as externalInputs', () => {
    const doc = makeGraphDoc([
      {
        id: 'f1',
        type: 'formula',
        title: 'Uses External',
        status: 'backlog',
        priority: 3,
        metadata: {
          expression: 'rate * base',
          inputs: ['rate', 'base'],
          outputs: ['result'],
          externalInputs: ['rate'],
        },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ])
    const result = analyzeFormulaConsistency(doc)
    // 'rate' is external, 'base' is unresolved
    expect(result.formulas[0].issues).toEqual([
      "Input 'base' is not provided by any formula output or declared external",
    ])
  })

  it('detects conflicting outputs (multiple formulas same output)', () => {
    const doc = makeGraphDoc([
      {
        id: 'f1',
        type: 'formula',
        title: 'Formula A',
        status: 'backlog',
        priority: 3,
        metadata: { expression: '1', inputs: [], outputs: ['x'] },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'f2',
        type: 'formula',
        title: 'Formula B',
        status: 'backlog',
        priority: 3,
        metadata: { expression: '2', inputs: [], outputs: ['x'] },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ])
    const result = analyzeFormulaConsistency(doc)
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0].output).toBe('x')
    expect(result.conflicts[0].formulaIds).toEqual(['f1', 'f2'])
  })

  it('handles missing metadata field gracefully', () => {
    const doc = makeGraphDoc([
      {
        id: 'f1',
        type: 'formula',
        title: 'No metadata',
        status: 'backlog',
        priority: 3,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      } as GraphDocument['nodes'][number],
    ])
    const result = analyzeFormulaConsistency(doc)
    expect(result.totalFormulas).toBe(1)
    expect(result.validCount).toBe(0)
    expect(result.formulas[0].issues).toContain("Missing 'expression' in metadata")
    expect(result.formulas[0].issues).toContain("Missing 'inputs' in metadata")
    expect(result.formulas[0].issues).toContain("Missing 'outputs' in metadata")
  })

  it('ignores non-formula nodes', () => {
    const doc = makeGraphDoc([
      { id: 't1', type: 'task', title: 'Task', status: 'backlog', priority: 3, createdAt: '', updatedAt: '' },
      { id: 'e1', type: 'epic', title: 'Epic', status: 'backlog', priority: 3, createdAt: '', updatedAt: '' },
    ])
    const result = analyzeFormulaConsistency(doc)
    expect(result.totalFormulas).toBe(0)
  })
})
