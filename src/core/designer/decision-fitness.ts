/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Decision Fitness Scoring Engine — evaluates architectural decisions
 * across 3 dimensions: friction, optimality, reversibility.
 *
 * Pure functions, no side effects. Keyword-based scoring without LLM.
 * ADR-CE-02: 100% deterministic, < 10ms per decision.
 */

import type { GraphNode } from '../graph/graph-types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'decision-fitness.ts' })

// ── Types ───────────────────────────────────────────────

export interface FrictionResult {
  score: number
  detectedKeywords: string[]
  justification: string
}

export interface Jtbd {
  situation: string
  motivation: string
  outcome: string
  sourceNodeId: string
}

export interface OptimalityResult {
  score: number
  matchedJtbds: Jtbd[]
  unmatchedJtbds: Jtbd[]
}

export interface ReversibilityResult {
  score: number
  lockInKeywords: string[]
  reversibleKeywords: string[]
}

export type DecisionFitnessGrade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface DecisionFitnessResult {
  composite: number
  grade: DecisionFitnessGrade
  breakdown: {
    friction: { score: number; weight: number }
    optimality: { score: number; weight: number }
    reversibility: { score: number; weight: number }
  }
}

// ── Constants ───────────────────────────────────────────

const FRICTION_KEYWORDS = [
  'npm install',
  'manual step',
  'configuration required',
  'setup',
  'extra dependency',
  'additional install',
  'requires installation',
  'must configure',
  'prerequisite',
  'manual configuration',
]

const LOCK_IN_KEYWORDS = [
  'migration',
  'vendor lock',
  'schema change',
  'breaking change',
  'permanent',
  'irreversible',
  'lock-in',
  'data restructuring',
]

const REVERSIBLE_KEYWORDS = [
  'feature flag',
  'config',
  'optional',
  'fallback',
  'rollback',
  'reversible',
  'toggle',
  'gradual rollout',
]

const WEIGHTS = {
  friction: 0.4,
  optimality: 0.35,
  reversibility: 0.25,
} as const

// ── Scoring Functions ───────────────────────────────────

/**
 * Score friction: how many extra steps the user needs to take.
 * 100 = zero friction, 0 = many steps.
 * Score = 100 - (detected_steps * 20), min 0.
 */
export function scoreFriction(decision: GraphNode): FrictionResult {
  const text = (decision.description ?? '').toLowerCase()
  const detectedKeywords: string[] = []

  for (const keyword of FRICTION_KEYWORDS) {
    if (text.includes(keyword.toLowerCase())) {
      detectedKeywords.push(keyword)
    }
  }

  const score = Math.max(0, 100 - detectedKeywords.length * 20)
  const justification =
    detectedKeywords.length === 0
      ? 'No friction indicators detected'
      : `Detected ${detectedKeywords.length} friction indicator(s): ${detectedKeywords.join(', ')}`

  log.debug('decision-fitness:friction', {
    nodeId: decision.id,
    score,
    keywords: detectedKeywords.length,
  })

  return { score, detectedKeywords, justification }
}

/**
 * Score optimality: how well the decision aligns with JTBDs.
 * Jaccard-like keyword overlap between decision text and JTBD motivation/outcome.
 * Score = (matched_jtbds / total_jtbds) * 100.
 */
export function scoreOptimality(decision: GraphNode, jtbds: Jtbd[]): OptimalityResult {
  if (jtbds.length === 0) {
    return { score: 100, matchedJtbds: [], unmatchedJtbds: [] }
  }

  const decisionText = (decision.description ?? '').toLowerCase()
  const decisionWords = new Set(tokenize(decisionText))

  const matchedJtbds: Jtbd[] = []
  const unmatchedJtbds: Jtbd[] = []

  for (const jtbd of jtbds) {
    const jtbdWords = new Set([...tokenize(jtbd.motivation.toLowerCase()), ...tokenize(jtbd.outcome.toLowerCase())])

    const intersection = [...jtbdWords].filter((w) => decisionWords.has(w))
    const union = new Set([...jtbdWords, ...decisionWords])
    const jaccard = union.size > 0 ? intersection.length / union.size : 0

    // Threshold 0.1 for a match (per ADR-CE-03: PARTIAL >= 0.1)
    if (jaccard >= 0.1) {
      matchedJtbds.push(jtbd)
    } else {
      unmatchedJtbds.push(jtbd)
    }
  }

  const score = Math.round((matchedJtbds.length / jtbds.length) * 100)

  log.debug('decision-fitness:optimality', {
    nodeId: decision.id,
    score,
    matched: matchedJtbds.length,
    total: jtbds.length,
  })

  return { score, matchedJtbds, unmatchedJtbds }
}

/**
 * Score reversibility: how easy is it to reverse the decision.
 * 100 = fully reversible (feature flag, config), 0 = permanent lock-in.
 * Score = reversible / (reversible + lockin) * 100.
 * Returns 50 (neutral) when no keywords detected.
 */
export function scoreReversibility(decision: GraphNode): ReversibilityResult {
  const text = (decision.description ?? '').toLowerCase()
  const lockInKeywords: string[] = []
  const reversibleKeywords: string[] = []

  for (const keyword of LOCK_IN_KEYWORDS) {
    if (text.includes(keyword.toLowerCase())) {
      lockInKeywords.push(keyword)
    }
  }

  for (const keyword of REVERSIBLE_KEYWORDS) {
    if (text.includes(keyword.toLowerCase())) {
      reversibleKeywords.push(keyword)
    }
  }

  const total = reversibleKeywords.length + lockInKeywords.length
  const score =
    total === 0
      ? 50 // neutral when no signals
      : Math.round((reversibleKeywords.length / total) * 100)

  log.debug('decision-fitness:reversibility', {
    nodeId: decision.id,
    score,
    reversible: reversibleKeywords.length,
    lockIn: lockInKeywords.length,
  })

  return { score, lockInKeywords, reversibleKeywords }
}

/**
 * Compute composite decision fitness score.
 * Weights: friction 40%, optimality 35%, reversibility 25%.
 * Grade: A >= 80, B >= 60, C >= 40, D >= 20, F < 20.
 */
export function computeDecisionFitness(
  friction: number,
  optimality: number,
  reversibility: number,
): DecisionFitnessResult {
  const composite = +(
    friction * WEIGHTS.friction +
    optimality * WEIGHTS.optimality +
    reversibility * WEIGHTS.reversibility
  ).toFixed(2)

  const grade = fitnessGrade(composite)

  return {
    composite,
    grade,
    breakdown: {
      friction: { score: friction, weight: WEIGHTS.friction },
      optimality: { score: optimality, weight: WEIGHTS.optimality },
      reversibility: { score: reversibility, weight: WEIGHTS.reversibility },
    },
  }
}

// ── Helpers ─────────────────────────────────────────────

/** Tokenize text into words, removing stop words and short tokens. */
function tokenize(text: string): string[] {
  const STOP_WORDS = new Set([
    'a',
    'an',
    'the',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'shall',
    'can',
    'to',
    'of',
    'in',
    'for',
    'on',
    'with',
    'at',
    'by',
    'from',
    'as',
    'into',
    'through',
    'during',
    'before',
    'after',
    'and',
    'but',
    'or',
    'nor',
    'not',
    'so',
    'yet',
    'both',
    'either',
    'neither',
    'each',
    'every',
    'all',
    'any',
    'few',
    'more',
    'most',
    'other',
    'some',
    'such',
    'no',
    'only',
    'own',
    'same',
    'than',
    'too',
    'very',
    'it',
    'its',
    'this',
    'that',
    'these',
    'those',
    'i',
    'we',
    'you',
    'he',
    'she',
    'they',
    'me',
    'us',
    'him',
    'her',
    'them',
    'my',
    'our',
    'your',
    'his',
    'their',
    'use',
    'using',
  ])

  return text
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
}

/** Grade based on ADR-CE-02 thresholds. */
function fitnessGrade(score: number): DecisionFitnessGrade {
  if (score >= 80) return 'A'
  if (score >= 60) return 'B'
  if (score >= 40) return 'C'
  if (score >= 20) return 'D'
  return 'F'
}
