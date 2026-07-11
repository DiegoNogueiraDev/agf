/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Run lifecycle — pure, immutable helpers for the session layer's first-class
 * Run object. A run moves through pending → active → (paused) → completed|failed.
 */

import { GraphError } from '../errors/graph-error.js'
import type { Run, RunBudget, RunStatus } from '../../schemas/session.schema.js'

/** Legal status transitions. Terminal states (completed/failed) have no successors. */
const TRANSITIONS: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
  pending: ['active'],
  active: ['paused', 'completed', 'failed'],
  paused: ['active', 'completed', 'failed'],
  completed: [],
  failed: [],
}

const TERMINAL: ReadonlySet<RunStatus> = new Set<RunStatus>(['completed', 'failed'])

/** Thrown when a run is asked to make an illegal status transition. */
export class IllegalRunTransitionError extends GraphError {
  constructor(from: RunStatus, to: RunStatus) {
    super(`Illegal run transition: ${from} -> ${to}`, { from, to })
    this.name = 'IllegalRunTransitionError'
  }
}

/** Create a fresh run in `pending` status with no end timestamp. */
export function createRun(runId: string, budget: RunBudget): Run {
  return {
    runId,
    status: 'pending',
    startedAt: Date.now(),
    endedAt: null,
    budget,
  }
}

/**
 * Return a NEW run advanced to `next`. Sets `endedAt` when entering a terminal
 * state. Throws `IllegalRunTransitionError` for disallowed moves; never mutates
 * the input.
 */
export function transitionRun(run: Run, next: RunStatus): Run {
  const allowed = TRANSITIONS[run.status]
  if (!allowed.includes(next)) {
    throw new IllegalRunTransitionError(run.status, next)
  }
  return {
    ...run,
    status: next,
    endedAt: TERMINAL.has(next) ? Date.now() : run.endedAt,
  }
}
