/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * B3 — Goal-driven loop: iterate → grade → revise → exit (RODA → CONFERE → CORRIGE).
 *
 * Iterates ONE objective against a rubric: attempt → an INDEPENDENT grader (B2)
 * checks the rubric → if not all-pass, the grader's feedback is fed into the next
 * attempt (the "revise" signal) → repeat until the rubric all-passes or a bound
 * is hit.
 *
 * This COMPLEMENTS — does not replace — the task-pull {@link runAutopilot}/DoD
 * cycle: `runAutopilot` drains a task QUEUE, whereas this loop refines a SINGLE
 * objective to a passing rubric.
 *
 * Guardrails (mirroring the autopilot style):
 * - **Cost-runaway bound**: `maxIterations` caps the number of attempts.
 * - **Cooperative abort**: an injected {@link AbortLike} stops the loop between
 *   iterations (never kills an in-flight call).
 * - **Pure orchestration**: all I/O (build + grade) is injected via
 *   {@link GoalLoopPort}; no live gateway/provider calls here.
 */

import type { AbortLike } from './autopilot-loop.js'
import type { GradeReport } from './grader.js'
import { logger } from '../utils/logger.js'

/**
 * Injected ports for one goal iteration — keeps the loop decoupled from live
 * providers and the SQLite store (testable with stub ports).
 */
export interface GoalLoopPort {
  /**
   * Produce a candidate output for this iteration. `feedback` is `null` on the
   * first turn, else the grader's feedback from the previous turn (the "revise"
   * signal). `iteration` is the zero-based attempt index.
   */
  attempt(feedback: string | null, iteration: number): Promise<string>
  /**
   * Grade the candidate against the bound rubric. Wrap B2's `gradeRubric` at the
   * call site so this loop stays free of rubric/model wiring.
   */
  grade(output: string): Promise<GradeReport>
}

/** Why the goal loop stopped. */
export type GoalStopReason = 'goal_met' | 'budget_exhausted' | 'aborted'

/** A single recorded iteration of the goal loop. */
export interface GoalLoopStep {
  iteration: number
  allPass: boolean
  feedback: string
}

export interface GoalLoopResult {
  stopped: GoalStopReason
  iterations: number
  /** The last grade report (the passing one when `goal_met`); `null` if never graded. */
  report: GradeReport | null
  steps: GoalLoopStep[]
}

export interface GoalLoopOptions {
  /** Cost-runaway bound: maximum number of attempts. Clamped to ≥ 1. */
  maxIterations: number
  /** Cooperative cancellation signal (compatible with AbortSignal). */
  signal?: AbortLike
}

/**
 * Run the goal-driven loop until the rubric all-passes, the budget is exhausted,
 * or the signal aborts. Deterministic given the injected port — no side effects
 * beyond the port calls.
 */
export async function runGoalLoop(port: GoalLoopPort, options: GoalLoopOptions): Promise<GoalLoopResult> {
  const maxIterations = Math.max(1, options.maxIterations)
  const steps: GoalLoopStep[] = []
  let feedback: string | null = null
  let last: GradeReport | null = null

  for (let i = 0; i < maxIterations; i++) {
    // Cooperative abort: check before producing/grading the next attempt.
    if (options.signal?.aborted === true) {
      logger.debug('goal-loop: aborted', { iteration: i })
      return { stopped: 'aborted', iterations: i, report: last, steps }
    }

    const output = await port.attempt(feedback, i)
    const report = await port.grade(output)
    last = report
    steps.push({ iteration: i, allPass: report.allPass, feedback: report.feedback })

    if (report.allPass) {
      logger.debug('goal-loop: goal met', { iterations: i + 1 })
      return { stopped: 'goal_met', iterations: i + 1, report, steps }
    }

    // Revise: the grader's feedback drives the next attempt.
    feedback = report.feedback
  }

  logger.debug('goal-loop: budget exhausted', { iterations: maxIterations })
  return { stopped: 'budget_exhausted', iterations: maxIterations, report: last, steps }
}
