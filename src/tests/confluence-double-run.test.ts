/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * task-confluence-tests — Confluence double-run tests for deterministic functions.
 *
 * Each test runs the same function twice with identical inputs and asserts
 * byte-identical output, proving confluence (no hidden nondeterminism from
 * random IDs, timestamps, or floating-point math).
 */
import { describe, it, expect } from 'vitest'
import { scoreToGrade } from '../core/utils/grading.js'
import { classifyText } from '../core/parser/classify.js'
import { buildIndexes } from '../core/graph/graph-indexes.js'
import { calculateCost } from '../core/observability/cost-tracker.js'
import type { GraphNode, GraphEdge } from '../core/graph/graph-types.js'

const now = '2026-06-06T12:00:00Z'

function stubNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: 'n1',
    type: 'task',
    title: 'Test',
    status: 'backlog',
    priority: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function stubEdge(overrides: Partial<GraphEdge> = {}): GraphEdge {
  return {
    id: 'e1',
    from: 'n1',
    to: 'n2',
    relationType: 'parent_of',
    createdAt: now,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// scoreToGrade — numeric → letter grade
// ---------------------------------------------------------------------------

describe('confluence: scoreToGrade', () => {
  it('produces byte-identical output on double-run (edge: A)', () => {
    const first = scoreToGrade(91)
    const second = scoreToGrade(91)
    expect(second).toBe(first)
    expect(first).toBe('A')
  })

  it('produces byte-identical output on double-run (edge: F)', () => {
    const first = scoreToGrade(25)
    const second = scoreToGrade(25)
    expect(second).toBe(first)
    expect(first).toBe('F')
  })

  it('produces byte-identical output on double-run (range: 0-100)', () => {
    for (const s of [0, 39, 40, 59, 60, 74, 75, 89, 90, 100]) {
      expect(scoreToGrade(s)).toBe(scoreToGrade(s))
    }
  })
})

// ---------------------------------------------------------------------------
// classifyText — PRD text → block type
// ---------------------------------------------------------------------------

describe('confluence: classifyText', () => {
  const samples = [
    '- [ ] Validar token JWT no middleware',
    'Epic: Autenticação multi-tenant',
    'Risco: latência da API externa pode exceder 500ms',
    'RN-001: Senha deve ter no mínimo 8 caracteres',
    'this is some random text without any prd markers',
  ]

  it('produces byte-identical output on double-run for multiple samples', () => {
    for (const text of samples) {
      const first = classifyText(text)
      const second = classifyText(text)
      expect(second.type).toBe(first.type)
      expect(second.confidence).toBe(first.confidence)
      expect(JSON.stringify(second)).toBe(JSON.stringify(first))
    }
  })
})

// ---------------------------------------------------------------------------
// buildIndexes — nodes + edges → graph indexes
// ---------------------------------------------------------------------------

describe('confluence: buildIndexes', () => {
  const nodes: GraphNode[] = [
    stubNode({ id: 'n1', type: 'epic', title: 'Epic 1' }),
    stubNode({ id: 'n2', type: 'task', title: 'Task A', parentId: 'n1' }),
    stubNode({ id: 'n3', type: 'task', title: 'Task B', parentId: 'n1' }),
  ]
  const edges: GraphEdge[] = [
    stubEdge({ id: 'e1', from: 'n1', to: 'n2', relationType: 'parent_of' }),
    stubEdge({ id: 'e2', from: 'n1', to: 'n3', relationType: 'parent_of' }),
  ]

  it('produces byte-identical indexes on double-run', () => {
    const first = buildIndexes(nodes, edges)
    const second = buildIndexes(nodes, edges)
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })

  it('produces correct children-by-parent on double-run', () => {
    const first = buildIndexes(nodes, edges)
    const second = buildIndexes(nodes, edges)
    expect(second.childrenByParent).toEqual(first.childrenByParent)
    expect(first.childrenByParent['n1']).toEqual(['n2', 'n3'])
  })

  it('produces byte-identical indexes with empty arrays', () => {
    const first = buildIndexes([], [])
    const second = buildIndexes([], [])
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })
})

// ---------------------------------------------------------------------------
// calculateCost — model + tokens → USD cost
// ---------------------------------------------------------------------------

describe('confluence: calculateCost', () => {
  it('produces byte-identical cost breakdown on double-run (claude-sonnet-4)', () => {
    const first = calculateCost('claude-sonnet-4', 5000, 2000)
    const second = calculateCost('claude-sonnet-4', 5000, 2000)
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
    expect(first.inputTokens).toBe(5000)
    expect(first.outputTokens).toBe(2000)
    expect(first.totalUsd).toBeGreaterThan(0)
  })

  it('produces byte-identical cost breakdown on double-run (gpt-4o)', () => {
    const first = calculateCost('gpt-4o', 10000, 3000)
    const second = calculateCost('gpt-4o', 10000, 3000)
    expect(second.totalUsd).toBe(first.totalUsd)
    expect(second.inputCostUsd).toBe(first.inputCostUsd)
    expect(second.outputCostUsd).toBe(first.outputCostUsd)
  })

  it('produces byte-identical cost breakdown on double-run (zero tokens)', () => {
    const first = calculateCost('claude-sonnet-4', 0, 0)
    const second = calculateCost('claude-sonnet-4', 0, 0)
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
    expect(first.totalUsd).toBe(0)
  })

  it('produces byte-identical cost breakdown for unknown model on double-run', () => {
    const first = calculateCost('unknown-model-xyz', 1000, 500)
    const second = calculateCost('unknown-model-xyz', 1000, 500)
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })

  // Alavanca de cache de prefixo: tokens de prefixo cacheado pagam fração (~10%) do input.
  it('aplica desconto de cache no input (prefixo estável — cache de prefixo)', () => {
    // 10k input, dos quais 8k vêm do cache de prefixo, 2k out.
    const noCache = calculateCost('deepseek/deepseek-chat', 10000, 2000)
    const withCache = calculateCost('deepseek/deepseek-chat', 10000, 2000, 8000)
    // O custo de input cai: 2k cheio + 8k a 10% < 10k cheio.
    expect(withCache.inputCostUsd).toBeLessThan(noCache.inputCostUsd)
    // Output não muda (cache só afeta input).
    expect(withCache.outputCostUsd).toBe(noCache.outputCostUsd)
    // Verifica a aritmética exata: (2000 + 8000*0.1)/1e6 * pIn = 2800/1e6 * pIn.
    const pIn = 0.14
    expect(withCache.inputCostUsd).toBeCloseTo((2800 / 1_000_000) * pIn, 12)
  })

  it('cache clampa em [0, inputTokens] (cachedIn > inputTokens não vira crédito)', () => {
    const a = calculateCost('deepseek/deepseek-chat', 1000, 0, 5000)
    // cached clamped a 1000 → input inteiro cobrado a 10%.
    expect(a.inputCostUsd).toBeCloseTo((1000 / 1_000_000) * 0.14 * 0.1, 12)
    expect(a.inputCostUsd).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// verify no hidden time-dependency in deterministic functions
// ---------------------------------------------------------------------------

describe('confluence: no hidden time-dependency', () => {
  it('scoreToGrade returns same value regardless of call timing', () => {
    const results: string[] = []
    for (let i = 0; i < 5; i++) {
      results.push(scoreToGrade(85))
    }
    expect(new Set(results).size).toBe(1)
    expect(results[0]).toBe('B')
  })

  it('buildIndexes returns same value regardless of call timing', () => {
    const nodes = [stubNode({ id: 'n1' })]
    const edges: GraphEdge[] = []
    const first = JSON.stringify(buildIndexes(nodes, edges))
    for (let i = 0; i < 5; i++) {
      expect(JSON.stringify(buildIndexes(nodes, edges))).toBe(first)
    }
  })
})
