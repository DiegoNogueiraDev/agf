/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  informationBottleneckScore,
  shouldAcceptCompression,
  distinctWordTokens,
  tokenRecall,
  acceptTextCompression,
} from '../core/economy/info-bottleneck.js'
import type { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode } from '../core/graph/graph-types.js'
import { buildCompressedContext } from '../core/context/compact-context.js'

describe('informationBottleneckScore (IB Lagrangian: βI(T;Y) − I(X;T))', () => {
  it('rewards compression that preserves predictive information', () => {
    const good = informationBottleneckScore({ tokensBefore: 1000, tokensAfter: 400, retainedInfo: 0.98 })
    expect(good).toBeGreaterThan(0)
  })

  it('punishes compression that destroys predictive information', () => {
    const bad = informationBottleneckScore({ tokensBefore: 1000, tokensAfter: 400, retainedInfo: 0.2 })
    expect(bad).toBeLessThan(0)
  })

  it('higher β (favouring fidelity) lowers the score for lossy compression', () => {
    const lowBeta = informationBottleneckScore({ tokensBefore: 1000, tokensAfter: 300, retainedInfo: 0.7, beta: 0.5 })
    const highBeta = informationBottleneckScore({ tokensBefore: 1000, tokensAfter: 300, retainedInfo: 0.7, beta: 4 })
    expect(highBeta).toBeLessThan(lowBeta)
  })

  it('no compression scores zero only when information is fully preserved', () => {
    expect(informationBottleneckScore({ tokensBefore: 500, tokensAfter: 500, retainedInfo: 1 })).toBeCloseTo(0, 5)
    expect(informationBottleneckScore({ tokensBefore: 500, tokensAfter: 500, retainedInfo: 0.9 })).toBeLessThan(0)
  })
})

describe('shouldAcceptCompression', () => {
  it('accepts a strong, faithful compression and rejects a lossy one', () => {
    expect(shouldAcceptCompression({ tokensBefore: 1000, tokensAfter: 350, retainedInfo: 0.95 })).toBe(true)
    expect(shouldAcceptCompression({ tokensBefore: 1000, tokensAfter: 350, retainedInfo: 0.3 })).toBe(false)
  })

  it('honours a custom acceptance threshold', () => {
    const input = { tokensBefore: 1000, tokensAfter: 600, retainedInfo: 0.8 }
    expect(shouldAcceptCompression(input, { threshold: -1 })).toBe(true)
    expect(shouldAcceptCompression(input, { threshold: 0.5 })).toBe(false)
  })
})

describe('distinctWordTokens', () => {
  it('extracts unique lowercase alphanumeric tokens', () => {
    expect(distinctWordTokens('Redis cache, REDIS Cache!')).toEqual(new Set(['redis', 'cache']))
  })

  it('returns an empty set for punctuation-only / empty text', () => {
    expect(distinctWordTokens('   ,.!? ')).toEqual(new Set())
    expect(distinctWordTokens('')).toEqual(new Set())
  })
})

describe('tokenRecall (fraction of distinct word tokens preserved)', () => {
  it('is 1 when every distinct token survives', () => {
    expect(tokenRecall('alpha beta gamma', 'gamma alpha beta extra')).toBe(1)
  })

  it('is 1 for empty source (nothing to lose)', () => {
    expect(tokenRecall('', 'anything')).toBe(1)
  })

  it('drops proportionally when tokens are lost', () => {
    // before has 4 distinct; after keeps 2 → 0.5
    expect(tokenRecall('one two three four', 'one two')).toBe(0.5)
  })

  it('detects loss of acceptance-criteria keywords', () => {
    const before = 'AC: persist redis fallback when gateway times out'
    const after = 'AC: persist' // dropped redis/fallback/gateway keywords
    expect(tokenRecall(before, after)).toBeLessThan(0.6)
  })
})

describe('acceptTextCompression (IB gate over before/after text)', () => {
  it('accepts a faithful compression that keeps every distinct keyword', () => {
    // Removes duplicate filler but preserves all distinct tokens → recall 1, infoLoss 0.
    const before = 'redis redis redis fallback fallback gateway timeout retry policy budget'
    const after = 'redis fallback gateway timeout retry policy budget'
    expect(acceptTextCompression(before, after)).toBe(true)
  })

  it('rejects an aggressive truncation that loses most keywords', () => {
    const before = 'redis fallback gateway timeout retry policy budget ledger provider tier router'
    const after = 'redis fallback' // lost most distinct tokens
    expect(acceptTextCompression(before, after)).toBe(false)
  })

  it('honours a custom beta (higher β → stricter)', () => {
    const before = 'one two three four five six'
    const after = 'one two three' // recall 0.5
    expect(acceptTextCompression(before, after, { beta: 0.5 })).toBe(true)
    expect(acceptTextCompression(before, after, { beta: 4 })).toBe(false)
  })
})

// ── Integration: the gate rejects lossy truncation in buildCompressedContext ────

function makeAcList(count: number): string[] {
  // Each AC carries a UNIQUE keyword (kw{i}) so truncation is detectable via tokenRecall.
  return Array.from({ length: count }, (_, i) => `AC${i + 1}: given kw${i + 1} when action then result`)
}

function makeNode(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
  const now = new Date().toISOString()
  return {
    id,
    type: 'task',
    title: `Task ${id}`,
    status: 'backlog',
    priority: 3,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

/** Mock store whose project-setting toggles the info_bottleneck lever. */
function makeStore(node: GraphNode, leverOn: boolean): SqliteStore {
  const setting = leverOn ? JSON.stringify({ info_bottleneck: { enabled: true } }) : null
  return {
    getNodeById: (id: string) => (id === node.id ? node : null),
    getChildNodes: () => [],
    getEdgesTo: () => [],
    getEdgesFrom: () => [],
    getProjectSetting: (key: string) => (key === 'economy_levers_config' ? setting : null),
  } as unknown as SqliteStore
}

describe('buildCompressedContext × info_bottleneck gate (AC5)', () => {
  it('lever OFF: truncates the AC list (legacy behaviour, zero regression)', () => {
    const node = makeNode('t1', { acceptanceCriteria: makeAcList(20) })
    const result = buildCompressedContext(makeStore(node, false), 't1')
    expect(result?.truncated.fields).toContain('acceptanceCriteria')
  })

  it('lever ON: rejects the lossy AC truncation and keeps all AC keywords', () => {
    const node = makeNode('t2', { acceptanceCriteria: makeAcList(20) })
    const result = buildCompressedContext(makeStore(node, true), 't2')
    // Gate rejected the truncation → fell back to the lossless (full) build.
    expect(result?.truncated.fields).not.toContain('acceptanceCriteria')
    // Every unique AC keyword survives in the serialized payload.
    const serialized = JSON.stringify(result?.payload)
    expect(serialized).toContain('kw1')
    expect(serialized).toContain('kw20')
  })
})
