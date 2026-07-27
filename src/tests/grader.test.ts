/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * B2 — Independent grader tests (TDD).
 */

import { describe, expect, it } from 'vitest'

import { buildGradingPrompt, gradeRubric, pickGraderModel, type GradeCall } from '../core/autonomy/grader.js'
import { buildRubric } from '../core/autonomy/rubric.js'
import { HAIKU, OPUS, SONNET } from '../core/llm/tier-router.js'
import { InvalidArgumentError } from '../core/utils/errors.js'

describe('pickGraderModel — external-verifier invariant at selection time', () => {
  it('returns a model different from the builder', () => {
    // Arrange / Act / Assert
    expect(pickGraderModel(SONNET)).not.toBe(SONNET)
    expect(pickGraderModel(OPUS)).not.toBe(OPUS)
  })

  it('defaults to HAIKU for a non-Haiku builder', () => {
    // Arrange / Act / Assert
    expect(pickGraderModel(SONNET)).toBe(HAIKU)
    expect(pickGraderModel(OPUS)).toBe(HAIKU)
  })

  it('falls back to SONNET when the builder is HAIKU', () => {
    // Arrange / Act / Assert
    expect(pickGraderModel(HAIKU)).toBe(SONNET)
  })
})

describe('buildGradingPrompt', () => {
  it('embeds the criterion description and the candidate output', () => {
    // Arrange
    const rubric = buildRubric([{ description: 'is polite', kind: 'llm' }])
    const criterion = rubric.criteria[0]

    // Act
    const prompt = buildGradingPrompt(criterion, 'hello there')

    // Assert
    expect(prompt).toContain('is polite')
    expect(prompt).toContain('hello there')
  })
})

describe('gradeRubric — AC1: grader model differs from the implementer', () => {
  const stub: GradeCall = async () => ({ passed: true, feedback: '' })

  it('grades with HAIKU when the builder is SONNET', async () => {
    // Arrange
    const rubric = buildRubric([{ description: 'subjective quality', kind: 'llm' }])

    // Act
    const report = await gradeRubric(rubric, 'output', { builderModel: SONNET, grade: stub })

    // Assert
    expect(report.graderModel).not.toBe(SONNET)
    expect(report.graderModel).toBe(HAIKU)
    expect(report.builderModel).toBe(SONNET)
  })

  it('throws a typed error when graderModel equals the builder', async () => {
    // Arrange
    const rubric = buildRubric([{ description: 'subjective quality', kind: 'llm' }])

    // Act / Assert
    await expect(
      gradeRubric(rubric, 'output', { builderModel: SONNET, graderModel: SONNET, grade: stub }),
    ).rejects.toBeInstanceOf(InvalidArgumentError)
  })
})

describe('gradeRubric — AC2: deterministic criteria evaluate with ZERO LLM', () => {
  it('calls the grade stub only for the llm criteria', async () => {
    // Arrange
    let calls = 0
    const counting: GradeCall = async () => {
      calls += 1
      return { passed: true, feedback: '' }
    }
    const rubric = buildRubric([
      { description: 'has TODO', kind: 'deterministic', pattern: 'TODO' },
      { description: 'mentions done', kind: 'deterministic', pattern: 'done' },
      { description: 'reads well', kind: 'llm' },
      { description: 'is accurate', kind: 'llm' },
    ])
    const output = 'TODO: finish — done'

    // Act
    await gradeRubric(rubric, output, { builderModel: SONNET, grade: counting })

    // Assert — only the 2 llm criteria hit the model; deterministic ones never did.
    expect(calls).toBe(2)
  })
})

describe('gradeRubric — AC3: per-criterion verdicts + aggregated feedback', () => {
  it('returns one verdict per criterion with id/kind/passed/feedback', async () => {
    // Arrange
    const grade: GradeCall = async (prompt) => {
      // Pass the "good" llm criterion, fail the "bad" one.
      if (prompt.includes('good llm')) return { passed: true, feedback: '' }
      return { passed: false, feedback: 'tone is off' }
    }
    const rubric = buildRubric([
      { description: 'has TODO', kind: 'deterministic', pattern: 'TODO' }, // passes
      { description: 'has MISSING', kind: 'deterministic', pattern: 'MISSING' }, // fails
      { description: 'good llm', kind: 'llm' }, // passes
      { description: 'bad llm', kind: 'llm' }, // fails
    ])
    const output = 'TODO only'

    // Act
    const report = await gradeRubric(rubric, output, { builderModel: SONNET, grade })

    // Assert — shape: one verdict per criterion.
    expect(report.verdicts).toHaveLength(4)
    for (const v of report.verdicts) {
      expect(v).toMatchObject({
        id: expect.any(String),
        kind: expect.stringMatching(/^(deterministic|llm)$/),
        passed: expect.any(Boolean),
        feedback: expect.any(String),
      })
    }

    const byId = new Map(report.verdicts.map((v) => [v.id, v]))
    expect(byId.get('c1')).toMatchObject({ kind: 'deterministic', passed: true, feedback: '' })
    expect(byId.get('c2')).toMatchObject({ kind: 'deterministic', passed: false })
    expect(byId.get('c2')?.feedback).not.toBe('')
    expect(byId.get('c3')).toMatchObject({ kind: 'llm', passed: true, feedback: '' })
    expect(byId.get('c4')).toMatchObject({ kind: 'llm', passed: false, feedback: 'tone is off' })

    // allPass reflects the failures.
    expect(report.allPass).toBe(false)
    // Aggregated feedback includes the failing verdicts' feedback.
    expect(report.feedback).toContain('tone is off')
    expect(report.feedback).toContain('has MISSING')
  })

  it('reports allPass with empty feedback when every criterion passes', async () => {
    // Arrange
    const grade: GradeCall = async () => ({ passed: true, feedback: '' })
    const rubric = buildRubric([
      { description: 'has TODO', kind: 'deterministic', pattern: 'TODO' },
      { description: 'reads well', kind: 'llm' },
    ])

    // Act
    const report = await gradeRubric(rubric, 'TODO here', { builderModel: SONNET, grade })

    // Assert
    expect(report.allPass).toBe(true)
    expect(report.feedback).toBe('')
    expect(report.verdicts.every((v) => v.passed)).toBe(true)
  })
})
