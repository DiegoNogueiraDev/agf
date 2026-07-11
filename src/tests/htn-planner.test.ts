/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_fdccbfa7ed7e — HTN skill planner with preconditions/effects
 *
 * AC1: htn-planner with skill registry: preconditions, effects, decomposition.
 * AC2: Each graph-* skill declares HTN operators (e.g., analyze→design requires DoR).
 * AC3: Auto-decomposition: compound task decomposes into ordered subtasks.
 * Test: decompose 'new feature' goal into phases.
 */

import { describe, it, expect } from 'vitest'
import { createHtnPlanner, type HtnOperator, type HtnPlan } from '../core/planner/htn-planner.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const OPERATORS: HtnOperator[] = [
  {
    name: 'analyze',
    preconditions: [],
    effects: ['has_prd'],
    subtasks: null,
  },
  {
    name: 'design',
    preconditions: ['has_prd'],
    effects: ['has_design'],
    subtasks: null,
  },
  {
    name: 'implement',
    preconditions: ['has_design'],
    effects: ['has_code'],
    subtasks: null,
  },
  {
    name: 'validate',
    preconditions: ['has_code'],
    effects: ['validated'],
    subtasks: null,
  },
  {
    // Compound task: decomposes into all 4 phases
    name: 'new-feature',
    preconditions: [],
    effects: ['validated'],
    subtasks: ['analyze', 'design', 'implement', 'validate'],
  },
]

// ── AC1 — skill registry: preconditions and effects ───────────────────────────

describe('HTN planner (AC1 — operator registry)', () => {
  it('registers operators and retrieves by name', () => {
    const planner = createHtnPlanner(OPERATORS)
    const op = planner.getOperator('analyze')
    expect(op).not.toBeNull()
    expect(op!.name).toBe('analyze')
    expect(op!.preconditions).toEqual([])
    expect(op!.effects).toContain('has_prd')
  })

  it('returns null for unknown operator', () => {
    const planner = createHtnPlanner(OPERATORS)
    expect(planner.getOperator('nonexistent')).toBeNull()
  })
})

// ── AC2 — graph-* skill operators: preconditions enforce order ────────────────

describe('HTN planner (AC2 — precondition enforcement)', () => {
  it('plan fails when preconditions are not met', () => {
    const planner = createHtnPlanner(OPERATORS)
    // design requires has_prd which is not in initialState
    const plan = planner.plan('design', new Set<string>())
    expect(plan.feasible).toBe(false)
  })

  it('plan succeeds when preconditions are satisfied in initial state', () => {
    const planner = createHtnPlanner(OPERATORS)
    const plan = planner.plan('design', new Set(['has_prd']))
    expect(plan.feasible).toBe(true)
    expect(plan.steps).toContain('design')
  })

  it('sequential primitives chain correctly', () => {
    const planner = createHtnPlanner(OPERATORS)
    const plan = planner.plan('analyze', new Set<string>())
    expect(plan.feasible).toBe(true)
    expect(plan.steps).toEqual(['analyze'])
    expect(plan.finalState.has('has_prd')).toBe(true)
  })
})

// ── AC3 — auto-decomposition of compound tasks ────────────────────────────────

describe('HTN planner (AC3 — compound decomposition)', () => {
  it('decomposes new-feature into 4 ordered steps', () => {
    const planner = createHtnPlanner(OPERATORS)
    const plan: HtnPlan = planner.plan('new-feature', new Set<string>())
    expect(plan.feasible).toBe(true)
    expect(plan.steps).toEqual(['analyze', 'design', 'implement', 'validate'])
  })

  it('final state after full decomposition contains all effects', () => {
    const planner = createHtnPlanner(OPERATORS)
    const plan = planner.plan('new-feature', new Set<string>())
    expect(plan.finalState.has('has_prd')).toBe(true)
    expect(plan.finalState.has('has_design')).toBe(true)
    expect(plan.finalState.has('has_code')).toBe(true)
    expect(plan.finalState.has('validated')).toBe(true)
  })

  it('infeasible if a sub-step cannot start', () => {
    const broken: HtnOperator[] = [
      { name: 'design', preconditions: ['missing_fact'], effects: ['has_design'], subtasks: null },
      { name: 'my-task', preconditions: [], effects: [], subtasks: ['design'] },
    ]
    const planner = createHtnPlanner(broken)
    const plan = planner.plan('my-task', new Set<string>())
    expect(plan.feasible).toBe(false)
  })
})
