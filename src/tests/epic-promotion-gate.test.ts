/*!
 * Task node_ad23efd7d9f2 — epic promotion gate blocks when children have required gaps.
 *
 * AC1: Given an epic with a child that has a required gap,
 *      When gated, Then blocks citing gap count.
 * AC2: Given zero required gaps in children, When gated, Then passes.
 */

import { describe, it, expect } from 'vitest'
import { checkEpicPromotionGate, type EpicGateResult } from '../core/utils/epic-promotion-gate.js'
import type { GraphNode } from '../core/graph/graph-types.js'

const TS = new Date().toISOString()

function node(id: string, type: string, extra: Partial<GraphNode> = {}): GraphNode {
  return { id, type, title: `Node ${id}`, status: 'in_progress', priority: 3, createdAt: TS, updatedAt: TS, ...extra }
}

function makeDoc(nodes: GraphNode[]) {
  return {
    version: '1.0.0',
    project: { id: 'proj_test', name: 'Test', createdAt: TS },
    nodes,
    edges: [],
    indexes: { byId: {} as Record<string, GraphNode> },
    meta: {},
  }
}

describe('checkEpicPromotionGate', () => {
  it('blocks when a child task has a required gap (AC1)', () => {
    // Epic with a child that has no AC (has_acceptance_criteria is required) and not in_progress
    const epic = node('epic_1', 'epic')
    // XL task without subtasks triggers non_atomic_task gap (recommended), but
    // a task with missing required AC triggers required gap
    const child = node('child_1', 'task', {
      parentId: 'epic_1',
      status: 'in_progress',
      // No acceptanceCriteria → triggers required gap has_acceptance_criteria
    })
    const doc = makeDoc([epic, child])
    const result: EpicGateResult = checkEpicPromotionGate(doc, 'epic_1')
    expect(result.blocked).toBe(true)
    expect(result.requiredGapCount).toBeGreaterThan(0)
    expect(result.reason).toMatch(/gap|required/i)
  })

  it('passes when children have no required gaps (AC2)', () => {
    const epic = node('epic_2', 'epic')
    // Child with strong AC and valid status → no required gaps
    const child = node('child_2', 'task', {
      parentId: 'epic_2',
      status: 'in_progress',
      acceptanceCriteria: ['Given X, When Y under 200ms, Then returns 201'],
    })
    const doc = makeDoc([epic, child])
    const result = checkEpicPromotionGate(doc, 'epic_2')
    expect(result.blocked).toBe(false)
    expect(result.requiredGapCount).toBe(0)
  })

  it('passes when epic has no children', () => {
    const epic = node('epic_3', 'epic')
    const doc = makeDoc([epic])
    const result = checkEpicPromotionGate(doc, 'epic_3')
    expect(result.blocked).toBe(false)
  })
})
