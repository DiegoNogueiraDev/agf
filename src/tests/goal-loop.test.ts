/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, expect, it } from 'vitest'
import { runGoalLoop, type GoalLoopPort } from '../core/autonomy/goal-loop.js'
import type { GradeReport } from '../core/autonomy/grader.js'

/** Build a minimal GradeReport stub — only the fields the loop reads matter. */
function makeReport(allPass: boolean, feedback: string): GradeReport {
  return {
    verdicts: [],
    allPass,
    feedback,
    graderModel: 'haiku' as GradeReport['graderModel'],
    builderModel: 'sonnet',
  }
}

describe('runGoalLoop', () => {
  it('exits goal_met only when the grader reports all-pass (false twice, then true)', async () => {
    // Arrange — grade returns allPass:false twice then allPass:true.
    const verdicts = [false, false, true]
    let gradeCalls = 0
    const port: GoalLoopPort = {
      attempt: async () => 'candidate',
      grade: async () => {
        const pass = verdicts[gradeCalls] ?? true
        gradeCalls++
        return makeReport(pass, pass ? '' : `fix attempt ${gradeCalls}`)
      },
    }

    // Act
    const result = await runGoalLoop(port, { maxIterations: 10 })

    // Assert
    expect(result.stopped).toBe('goal_met')
    expect(result.iterations).toBe(3)
    expect(result.report?.allPass).toBe(true)
    expect(result.steps).toHaveLength(3)
    expect(result.steps.map((s) => s.allPass)).toEqual([false, false, true])
  })

  it('injects the grader feedback into the next attempt (null first, then prior feedback)', async () => {
    // Arrange — capture feedback passed to attempt across iterations.
    const seenFeedback: Array<string | null> = []
    const feedbacks = ['needs work A', 'needs work B', '']
    let gradeCalls = 0
    const port: GoalLoopPort = {
      attempt: async (feedback) => {
        seenFeedback.push(feedback)
        return 'candidate'
      },
      grade: async () => {
        const idx = gradeCalls
        gradeCalls++
        const allPass = idx >= 2 // pass on the 3rd grade
        return makeReport(allPass, feedbacks[idx] ?? '')
      },
    }

    // Act
    const result = await runGoalLoop(port, { maxIterations: 10 })

    // Assert — iteration 0 gets null, iteration 1+ gets previous report's feedback.
    expect(result.stopped).toBe('goal_met')
    expect(seenFeedback).toEqual([null, 'needs work A', 'needs work B'])
  })

  it('enforces the maxIterations bound with stop reason budget_exhausted', async () => {
    // Arrange — grader NEVER all-passes.
    let attemptCalls = 0
    const port: GoalLoopPort = {
      attempt: async () => {
        attemptCalls++
        return 'candidate'
      },
      grade: async () => makeReport(false, 'still failing'),
    }

    // Act
    const result = await runGoalLoop(port, { maxIterations: 3 })

    // Assert
    expect(result.stopped).toBe('budget_exhausted')
    expect(result.iterations).toBe(3)
    expect(attemptCalls).toBe(3)
    expect(result.report?.allPass).toBe(false)
    expect(result.steps).toHaveLength(3)
  })

  it('short-circuits to aborted when the signal is aborted', async () => {
    // Arrange — signal aborted from the start.
    let attemptCalls = 0
    const port: GoalLoopPort = {
      attempt: async () => {
        attemptCalls++
        return 'candidate'
      },
      grade: async () => makeReport(true, ''),
    }

    // Act
    const result = await runGoalLoop(port, { maxIterations: 5, signal: { aborted: true } })

    // Assert — never attempted, never graded.
    expect(result.stopped).toBe('aborted')
    expect(result.iterations).toBe(0)
    expect(attemptCalls).toBe(0)
    expect(result.report).toBeNull()
    expect(result.steps).toHaveLength(0)
  })

  it('defensively clamps maxIterations to at least 1', async () => {
    // Arrange — grader passes immediately; maxIterations:0 must still run once.
    let attemptCalls = 0
    const port: GoalLoopPort = {
      attempt: async () => {
        attemptCalls++
        return 'candidate'
      },
      grade: async () => makeReport(true, ''),
    }

    // Act
    const result = await runGoalLoop(port, { maxIterations: 0 })

    // Assert
    expect(attemptCalls).toBe(1)
    expect(result.stopped).toBe('goal_met')
    expect(result.iterations).toBe(1)
  })
})
