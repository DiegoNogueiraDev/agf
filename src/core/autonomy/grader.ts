/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * B2 — Independent grader.
 *
 * Grades a candidate output against a {@link Rubric} (B1) using an INDEPENDENT
 * model — never the builder model. This is the EXTERNAL-VERIFIER invariant: the
 * agent that produced an output must not be the agent that judges it.
 *
 * Cost discipline: `deterministic` criteria are evaluated with ZERO LLM (reusing
 * {@link evaluateRubric}); only `llm` criteria are sent to the grader model via
 * an INJECTED {@link GradeCall} (keeps this module testable and decoupled from
 * live providers, which require auth — that wiring is B3).
 */

import { HAIKU, SONNET, type ModelName } from '../llm/tier-router.js'
import { InvalidArgumentError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import { evaluateRubric, type Rubric, type RubricCriterion } from './rubric.js'

/** Result of an injected grader-model call for a single `llm` criterion. */
export interface GradeCallResult {
  passed: boolean
  feedback: string
}

/** Injected LLM call — sends a grading prompt to a model, returns a verdict. */
export type GradeCall = (prompt: string, model: ModelName) => Promise<GradeCallResult>

export interface GradeOptions {
  /** The model that produced the candidate output (the builder/implementer). */
  builderModel: ModelName | string
  /** Injected grader-model call (decoupled from live providers). */
  grade: GradeCall
  /** Optional explicit grader model. Must differ from `builderModel`. */
  graderModel?: ModelName
}

/** A graded verdict for one rubric criterion. */
export interface RubricVerdict {
  id: string
  kind: 'deterministic' | 'llm'
  passed: boolean
  feedback: string
}

/** The full grading report — verdicts + aggregate + traceability fields. */
export interface GradeReport {
  verdicts: RubricVerdict[]
  allPass: boolean
  feedback: string
  graderModel: ModelName
  builderModel: string
}

/**
 * Pick a grader model DIFFERENT from the builder model (external-verifier
 * invariant enforced at selection time). Defaults to the cheap/fast HAIKU; if
 * the builder is already HAIKU, escalates to SONNET so the two never coincide.
 */
export function pickGraderModel(builderModel: ModelName | string): ModelName {
  return builderModel === HAIKU ? SONNET : HAIKU
}

/** Build a compact grading prompt for a single `llm` criterion. */
export function buildGradingPrompt(criterion: RubricCriterion, output: string): string {
  return [
    'You are an independent grader. Judge whether the OUTPUT satisfies the CRITERION.',
    `CRITERION: ${criterion.description}`,
    'OUTPUT:',
    output,
    'Answer pass/fail and, if fail, a one-line reason.',
  ].join('\n')
}

/**
 * Grade a rubric against candidate output using an INDEPENDENT model.
 *
 * Deterministic criteria are graded with ZERO LLM (via {@link evaluateRubric});
 * each `llm` criterion is sent to the injected grader via {@link GradeCall}.
 * The grader model is asserted distinct from the builder model.
 */
export async function gradeRubric(rubric: Rubric, output: string, opts: GradeOptions): Promise<GradeReport> {
  const graderModel = opts.graderModel ?? pickGraderModel(opts.builderModel)
  if (graderModel === opts.builderModel) {
    throw new InvalidArgumentError(
      `External-verifier invariant violated: grader model "${graderModel}" must differ from the builder model.`,
    )
  }

  const evaluation = evaluateRubric(rubric, output)

  // 1) Deterministic verdicts — ZERO LLM.
  const verdicts: RubricVerdict[] = []
  const criterionById = new Map(rubric.criteria.map((c) => [c.id, c]))
  for (const result of evaluation.results) {
    if (result.kind !== 'deterministic') continue
    const passed = result.passed === true
    const description = criterionById.get(result.id)?.description ?? result.id
    verdicts.push({
      id: result.id,
      kind: 'deterministic',
      passed,
      feedback: passed ? '' : `criterion not met: ${description}`,
    })
  }

  // 2) LLM verdicts — one injected grader call per pending criterion.
  for (const criterion of evaluation.pending) {
    const callResult = await opts.grade(buildGradingPrompt(criterion, output), graderModel)
    verdicts.push({
      id: criterion.id,
      kind: 'llm',
      passed: callResult.passed,
      feedback: callResult.passed ? '' : callResult.feedback,
    })
  }

  const allPass = verdicts.every((v) => v.passed)
  const feedback = allPass
    ? ''
    : verdicts
        .filter((v) => !v.passed)
        .map((v) => v.feedback)
        .filter((f) => f.length > 0)
        .join('\n')

  logger.debug('grader: rubric graded', {
    graderModel,
    builderModel: String(opts.builderModel),
    total: verdicts.length,
    allPass,
  })

  return {
    verdicts,
    allPass,
    feedback,
    graderModel,
    builderModel: String(opts.builderModel),
  }
}
