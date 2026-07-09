/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_d58309ef7c38 AC coverage: quarantine-diagnosis.ts
 *
 * AC: agf heal --quarantine lists quarantined nodes with
 *     {nodeId, failureCount, lastError, suggestedAction}
 * AC: suggestedAction: split_task|rewrite_ac|remove_node|fix_blocker
 * AC: output includes exact agf commands for each action
 */

import { describe, it, expect } from 'vitest'
import { diagnoseQuarantinedNode, type QuarantineDiagnosis } from '../core/colony/quarantine-diagnosis.js'

type NodeInput = {
  id: string
  title: string
  acceptanceCriteria?: string[]
  blocked?: boolean
  xpSize?: string
  failureCount?: number
  lastError?: string
}

function node(overrides: Partial<NodeInput> = {}): NodeInput {
  return {
    id: 'node_abc',
    title: 'Some quarantined task',
    acceptanceCriteria: ['do X'],
    blocked: false,
    xpSize: 'S',
    failureCount: 0,
    lastError: undefined,
    ...overrides,
  }
}

// ── suggestedAction ───────────────────────────────────────────────────────────

describe('suggestedAction', () => {
  it('returns fix_blocker when node is blocked', () => {
    const result = diagnoseQuarantinedNode(node({ blocked: true }))
    expect(result.suggestedAction).toBe('fix_blocker')
  })

  it('returns rewrite_ac when no acceptance criteria', () => {
    const result = diagnoseQuarantinedNode(node({ acceptanceCriteria: [] }))
    expect(result.suggestedAction).toBe('rewrite_ac')
  })

  it('returns split_task when size is L or XL', () => {
    expect(diagnoseQuarantinedNode(node({ xpSize: 'L' })).suggestedAction).toBe('split_task')
    expect(diagnoseQuarantinedNode(node({ xpSize: 'XL' })).suggestedAction).toBe('split_task')
  })

  it('returns remove_node when failureCount >= 3', () => {
    const result = diagnoseQuarantinedNode(node({ failureCount: 3 }))
    expect(result.suggestedAction).toBe('remove_node')
  })

  it('returns remove_node when failureCount > 3', () => {
    const result = diagnoseQuarantinedNode(node({ failureCount: 5 }))
    expect(result.suggestedAction).toBe('remove_node')
  })

  it('returns rewrite_ac as default when no specific signal', () => {
    const result = diagnoseQuarantinedNode(node({ failureCount: 1 }))
    expect(result.suggestedAction).toBe('rewrite_ac')
  })

  it('fix_blocker takes priority over other signals', () => {
    const result = diagnoseQuarantinedNode(node({ blocked: true, acceptanceCriteria: [], xpSize: 'XL' }))
    expect(result.suggestedAction).toBe('fix_blocker')
  })
})

// ── agf command output ────────────────────────────────────────────────────────

describe('agf commands in diagnosis', () => {
  it('fix_blocker includes agf edge or heal command', () => {
    const result = diagnoseQuarantinedNode(node({ blocked: true }))
    expect(result.agfCommands.some((c) => c.includes('agf'))).toBe(true)
  })

  it('rewrite_ac includes agf node update command', () => {
    const result = diagnoseQuarantinedNode(node({ acceptanceCriteria: [] }))
    expect(result.agfCommands.some((c) => c.includes('agf node update'))).toBe(true)
  })

  it('split_task includes agf decompose command', () => {
    const result = diagnoseQuarantinedNode(node({ xpSize: 'XL' }))
    expect(result.agfCommands.some((c) => c.includes('agf decompose') || c.includes('agf node add'))).toBe(true)
  })

  it('remove_node includes agf node rm command', () => {
    const result = diagnoseQuarantinedNode(node({ failureCount: 3 }))
    expect(result.agfCommands.some((c) => c.includes('agf node rm'))).toBe(true)
  })
})

// ── return shape ──────────────────────────────────────────────────────────────

describe('return shape', () => {
  it('has all required fields', () => {
    const result = diagnoseQuarantinedNode(node()) as QuarantineDiagnosis
    expect(typeof result.nodeId).toBe('string')
    expect(typeof result.title).toBe('string')
    expect(typeof result.failureCount).toBe('number')
    expect(typeof result.suggestedAction).toBe('string')
    expect(Array.isArray(result.agfCommands)).toBe(true)
  })

  it('nodeId matches input', () => {
    const result = diagnoseQuarantinedNode(node({ id: 'node_xyz' }))
    expect(result.nodeId).toBe('node_xyz')
  })

  it('failureCount reflects input', () => {
    const result = diagnoseQuarantinedNode(node({ failureCount: 2 }))
    expect(result.failureCount).toBe(2)
  })

  it('lastError is included when provided', () => {
    const result = diagnoseQuarantinedNode(node({ lastError: 'AC not testable' }))
    expect(result.lastError).toBe('AC not testable')
  })

  it('lastError is undefined when not provided', () => {
    const result = diagnoseQuarantinedNode(node())
    expect(result.lastError).toBeUndefined()
  })
})
