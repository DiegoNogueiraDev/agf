/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_1ffe8eb1c7b9 — the delivery state machine looped forever on `import_prd`
 * for a PRD that yields TASKS but no `requirement` nodes: the import_prd rule fired
 * on `hasRequirements: false`, which stays false after a task-only import, so the
 * graph never progressed to implement (0 model calls, silent ~2ms budget-stop).
 * Fix: import_prd fires ONLY on an empty graph — once ANY nodes exist, move on.
 */

import { describe, it, expect } from 'vitest'
import { nextDeliveryAction, type DeliveryState } from '../core/orchestrator/orchestrator.js'

function state(over: Partial<DeliveryState> = {}): DeliveryState {
  return {
    totalNodes: 0,
    hasRequirements: false,
    oversizedCount: 0,
    readyTasks: 0,
    inProgress: 0,
    allBlocked: false,
    doneRatio: 0,
    ...over,
  }
}

describe('nextDeliveryAction — import happens once, never loops', () => {
  it('empty graph → import_prd (unchanged)', () => {
    expect(nextDeliveryAction(state({ totalNodes: 0 })).action).toBe('import_prd')
  })

  it('task-only import (nodes + ready tasks, no requirement nodes) → implement, NOT re-import', () => {
    // The regression: this used to return import_prd forever, starving implement.
    expect(nextDeliveryAction(state({ totalNodes: 5, hasRequirements: false, readyTasks: 1 })).action).toBe('implement')
  })

  it('a non-empty graph NEVER returns import_prd (no infinite re-import)', () => {
    for (const s of [
      state({ totalNodes: 3, hasRequirements: false, readyTasks: 1 }),
      state({ totalNodes: 3, hasRequirements: false, oversizedCount: 1 }),
      state({ totalNodes: 3, hasRequirements: false, inProgress: 1 }),
      state({ totalNodes: 3, hasRequirements: false }), // nothing actionable → escalate, not import
    ]) {
      expect(nextDeliveryAction(s).action).not.toBe('import_prd')
    }
  })

  it('oversized task-only import → decompose (still progresses)', () => {
    expect(nextDeliveryAction(state({ totalNodes: 3, hasRequirements: false, oversizedCount: 1 })).action).toBe(
      'decompose',
    )
  })
})
