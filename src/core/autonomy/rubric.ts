/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * B1 — Rubric/goal primitive.
 *
 * A gradable RUBRIC: a set of criteria, each with a pass/fail spec, attachable
 * to a graph node or an autopilot session. It grades the OBJECTIVE's end-state —
 * distinct from per-task DoD. This is the foundation for the goal-driven loop.
 *
 * Two criterion kinds:
 *  - `deterministic` — carries a `pattern` (substring or `/regex/`) checked
 *    against candidate output. Evaluates pass/fail with ZERO LLM.
 *  - `llm` — no pattern; deferred to the independent LLM grader (task B2).
 *
 * This module is pure, deterministic, dependency-free. NO LLM grading,
 * tier-router calls, or loop changes live here.
 */

import type { GraphNode } from '../graph/graph-types.js'
import { logger } from '../utils/logger.js'

export type CriterionKind = 'deterministic' | 'llm'

export interface RubricCriterion {
  id: string
  description: string
  kind: CriterionKind
  /** Present only for `deterministic` criteria: a substring or `/regex/` spec. */
  pattern?: string
}

export interface Rubric {
  criteria: RubricCriterion[]
}

/** Outcome of grading a single criterion. `null` = pending LLM grade (B2). */
export interface CriterionResult {
  id: string
  kind: CriterionKind
  passed: boolean | null
}

export interface RubricEvaluation {
  results: CriterionResult[]
  /** True iff every `deterministic` criterion passed (vacuously true when none). */
  deterministicAllPass: boolean
  /** The `llm` criteria awaiting the independent grader (B2). */
  pending: RubricCriterion[]
}

/** A spec used to seed a rubric: a bare AC string or a structured criterion. */
export type RubricSpec = string | { description: string; kind?: CriterionKind; pattern?: string }

/** Where the attached rubric lives inside a node's metadata. */
const METADATA_KEY = 'rubric'

/** Inline marker that promotes a bare AC string to a deterministic criterion. */
const INLINE_PATTERN_MARKER = 'pattern:'

/**
 * Parse a bare AC string. If it contains an inline `pattern:<spec>` marker, the
 * remainder becomes a deterministic criterion's pattern; otherwise it is an
 * `llm` criterion (subjective, deferred to B2).
 */
function parseBareSpec(text: string, id: string): RubricCriterion {
  const idx = text.indexOf(INLINE_PATTERN_MARKER)
  if (idx >= 0) {
    const pattern = text.slice(idx + INLINE_PATTERN_MARKER.length).trim()
    if (pattern.length > 0) {
      return { id, description: text.trim(), kind: 'deterministic', pattern }
    }
  }
  return { id, description: text.trim(), kind: 'llm' }
}

/**
 * Build a rubric from plain AC strings or structured specs. Reuses the
 * `acceptanceCriteria: string[]` shape so a node's AC can seed a rubric. Ids are
 * assigned stably as `c1`, `c2`, … in input order.
 */
export function buildRubric(specs: RubricSpec[]): Rubric {
  const criteria: RubricCriterion[] = specs.map((spec, i) => {
    const id = `c${i + 1}`
    if (typeof spec === 'string') {
      return parseBareSpec(spec, id)
    }
    const kind: CriterionKind = spec.kind ?? (spec.pattern ? 'deterministic' : 'llm')
    const criterion: RubricCriterion = { id, description: spec.description, kind }
    if (kind === 'deterministic' && spec.pattern !== undefined) {
      criterion.pattern = spec.pattern
    }
    return criterion
  })
  return { criteria }
}

/** Compile a `/regex/flags` or substring `pattern` into a RegExp, or null. */
function compilePattern(pattern: string): RegExp | null {
  const slashMatch = /^\/(.+)\/([a-z]*)$/s.exec(pattern)
  try {
    if (slashMatch) {
      // eslint-disable-next-line security/detect-non-literal-regexp -- criterion patterns are user-authored rubric specs, intentionally dynamic
      return new RegExp(slashMatch[1], slashMatch[2])
    }
    // Plain substring → literal match (escape regex metacharacters).
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // eslint-disable-next-line security/detect-non-literal-regexp -- escaped literal substring; intentionally dynamic
    return new RegExp(escaped)
  } catch (err) {
    logger.warn('rubric: invalid criterion pattern', { pattern, error: String(err) })
    return null
  }
}

/**
 * Evaluate a single criterion against candidate output.
 *  - `deterministic`: tests `pattern` (substring or `/regex/`); ZERO LLM.
 *    A missing/invalid pattern fails closed (`passed: false`).
 *  - `llm`: returns `passed: null` (pending — graded later by B2).
 */
export function evaluateCriterion(c: RubricCriterion, output: string): CriterionResult {
  if (c.kind === 'llm') {
    return { id: c.id, kind: 'llm', passed: null }
  }
  if (c.pattern === undefined || c.pattern.length === 0) {
    return { id: c.id, kind: 'deterministic', passed: false }
  }
  const re = compilePattern(c.pattern)
  if (re === null) {
    return { id: c.id, kind: 'deterministic', passed: false }
  }
  return { id: c.id, kind: 'deterministic', passed: re.test(output) }
}

/**
 * Evaluate every criterion in a rubric against candidate output.
 * `deterministicAllPass` summarizes the zero-LLM gate; `pending` lists the
 * `llm` criteria awaiting the independent grader (B2).
 */
export function evaluateRubric(rubric: Rubric, output: string): RubricEvaluation {
  const results = rubric.criteria.map((c) => evaluateCriterion(c, output))
  const deterministicAllPass = results.filter((r) => r.kind === 'deterministic').every((r) => r.passed === true)
  const pending = rubric.criteria.filter((c) => c.kind === 'llm')
  return { results, deterministicAllPass, pending }
}

/**
 * Attach a rubric to a node via `metadata.rubric`. Pure: returns a new node and
 * preserves existing metadata; the input node is not mutated.
 */
export function attachRubric(node: GraphNode, rubric: Rubric): GraphNode {
  return {
    ...node,
    metadata: {
      ...(node.metadata ?? {}),
      [METADATA_KEY]: rubric,
    },
  }
}

/** Read a previously attached rubric from a node, or null if none. Pure. */
export function readRubric(node: GraphNode): Rubric | null {
  const raw = node.metadata?.[METADATA_KEY]
  if (raw === undefined || raw === null || typeof raw !== 'object') {
    return null
  }
  const candidate = raw as { criteria?: unknown }
  if (!Array.isArray(candidate.criteria)) {
    return null
  }
  return candidate as Rubric
}
