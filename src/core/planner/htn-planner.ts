/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * HTN (Hierarchical Task Network) Planner — formal task decomposition.
 * Primitive tasks execute directly (preconditions checked, effects applied).
 * Compound tasks decompose into an ordered subtask list (recursively resolved).
 *
 * WHY: replaces flat skill delegation with formal precondition/effect reasoning,
 * enabling auto-decomposition of goals (e.g. 'new-feature' → 9-phase task tree)
 * without LLM calls (deterministic, ~0 token).
 *
 * Composing: src/core/planner/ family (decompose, lifecycle-phase, auto-decompose).
 */

/** A skill or phase operator in the HTN registry. */
export interface HtnOperator {
  name: string
  /** Facts that must hold in the current state before this operator can run. */
  preconditions: string[]
  /** Facts added to the state after this operator completes. */
  effects: string[]
  /** Null = primitive task; array = compound task (ordered subtask names). */
  subtasks: string[] | null
}

/** The result of planning a task from an initial state. */
export interface HtnPlan {
  /** Ordered list of primitive task names to execute. */
  steps: string[]
  /** World state after all steps have been applied. */
  finalState: Set<string>
  /** False if any precondition was unmet during planning. */
  feasible: boolean
}

export interface HtnPlanner {
  /** Retrieve an operator by name, or null if not registered. */
  getOperator(name: string): HtnOperator | null
  /**
   * Plan execution of `taskName` starting from `initialState`.
   * Returns a flat ordered list of primitive steps.
   */
  plan(taskName: string, initialState: Set<string>): HtnPlan
}

/**
 * Create an HTN planner from an array of operator definitions.
 * Duplicate names: last definition wins.
 */
export function createHtnPlanner(operators: HtnOperator[]): HtnPlanner {
  const registry = new Map<string, HtnOperator>()
  for (const op of operators) {
    registry.set(op.name, op)
  }

  function resolve(name: string, state: Set<string>, steps: string[]): boolean {
    const op = registry.get(name)
    if (!op) return false

    // Check preconditions
    for (const pre of op.preconditions) {
      if (!state.has(pre)) return false
    }

    if (op.subtasks === null) {
      // Primitive: apply effects and record step
      steps.push(name)
      for (const effect of op.effects) state.add(effect)
    } else {
      // Compound: recursively resolve each subtask
      for (const sub of op.subtasks) {
        if (!resolve(sub, state, steps)) return false
      }
    }
    return true
  }

  return {
    getOperator(name: string): HtnOperator | null {
      return registry.get(name) ?? null
    },

    plan(taskName: string, initialState: Set<string>): HtnPlan {
      const state = new Set(initialState)
      const steps: string[] = []
      const feasible = resolve(taskName, state, steps)
      return { steps, finalState: state, feasible }
    },
  }
}
