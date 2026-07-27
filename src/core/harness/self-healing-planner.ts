/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Self-Healing Planner — MAPE-K Autonomous Remediation
 *
 * Implements the MAPE-K loop (IBM, 2003) for autonomous harness improvement:
 * - Monitor: Read harness dimension scores
 * - Analyze: Identify dimensions below threshold with highest impact potential
 * - Plan: Generate micro-PR plans (< 50 lines, dry-run first)
 * - Execute: (deferred to agent — this module only plans)
 * - Knowledge: Score delta tracking for feedback
 *
 * Part of the Autonomous Agent AAA+ pipeline — Pilar 3: Anti-Hallucination.
 */

import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'self-healing-planner.ts' })

// ── Types ───────────────────────────────────────────────

export interface DimensionScore {
  name: string
  score: number
  weight: number
}

export interface QuickWin {
  dimension: string
  currentScore: number
  targetScore: number
  potentialImpact: number
  suggestedAction: string
}

export interface MicroPRPlan {
  dimension: string
  branch: string
  dryRun: boolean
  estimatedDelta: number
  maxLinesChanged: number
  suggestedAction: string
  rejected: boolean
  rejectReason?: string
}

// ── Constants ───────────────────────────────────────────

const IMPROVEMENT_THRESHOLD = 70
const MAX_QUICK_WINS = 5
const MAX_LINES_PER_PR = 50

/** Suggested actions per dimension */
const DIMENSION_ACTIONS: Record<string, string> = {
  type_coverage: 'Replace `any` types with proper TypeScript types',
  test_coverage: 'Add tests for uncovered modules',
  naming_clarity: 'Rename generic variables to descriptive names',
  error_handling: 'Replace raw throws with typed errors from utils/errors.ts',
  context_density: 'Add JSDoc to exported functions missing documentation',
  docs_coverage: 'Add missing documentation files (README, guides)',
  architecture_fitness: 'Fix dependency direction violations',
}

/** Estimated lines to fix per point of improvement per dimension */
const LINES_PER_POINT: Record<string, number> = {
  type_coverage: 2,
  test_coverage: 10,
  naming_clarity: 1,
  error_handling: 3,
  context_density: 2,
  docs_coverage: 5,
  architecture_fitness: 4,
}

// ── Monitor + Analyze ───────────────────────────────────

/**
 * Identify top-N quick wins from harness dimension scores.
 * Ranks by potential impact: weight × (threshold - score).
 *
 * Only considers dimensions scoring below IMPROVEMENT_THRESHOLD (70).
 */
export function identifyQuickWins(dimensions: DimensionScore[]): QuickWin[] {
  const candidates: QuickWin[] = []

  for (const dim of dimensions) {
    if (dim.score >= IMPROVEMENT_THRESHOLD) continue

    const gap = IMPROVEMENT_THRESHOLD - dim.score
    const potentialImpact = dim.weight * gap

    candidates.push({
      dimension: dim.name,
      currentScore: dim.score,
      targetScore: IMPROVEMENT_THRESHOLD,
      potentialImpact: Math.round(potentialImpact * 100) / 100,
      suggestedAction: DIMENSION_ACTIONS[dim.name] ?? `Improve ${dim.name}`,
    })
  }

  // Sort by potential impact (highest first)
  candidates.sort((a, b) => b.potentialImpact - a.potentialImpact)

  const wins = candidates.slice(0, MAX_QUICK_WINS)

  log.debug('self-healing:quick-wins', {
    total: dimensions.length,
    belowThreshold: candidates.length,
    selected: wins.length,
  })

  return wins
}

// ── Plan ────────────────────────────────────────────────

/**
 * Generate a micro-PR plan for a quick win.
 * Always dry-run first — never auto-commit.
 *
 * Rejects plan if estimated scope exceeds MAX_LINES_PER_PR (50 lines).
 */
export function generateMicroPRPlan(win: QuickWin, dryRun: boolean): MicroPRPlan {
  const gap = win.targetScore - win.currentScore
  const linesPerPoint = LINES_PER_POINT[win.dimension] ?? 3

  // Estimate: fix enough to reach threshold, capped at MAX_LINES
  // We aim to improve by at most 10 points per micro-PR
  const pointsToFix = Math.min(gap, 10)
  const estimatedLines = pointsToFix * linesPerPoint

  const branch = `harness/improve-${win.dimension}`

  if (estimatedLines > MAX_LINES_PER_PR) {
    log.info('self-healing:plan-rejected', {
      dimension: win.dimension,
      estimatedLines,
      maxAllowed: MAX_LINES_PER_PR,
    })

    return {
      dimension: win.dimension,
      branch,
      dryRun,
      estimatedDelta: pointsToFix,
      maxLinesChanged: estimatedLines,
      suggestedAction: win.suggestedAction,
      rejected: true,
      rejectReason: `Estimated scope (${estimatedLines} lines) exceeds maximum (${MAX_LINES_PER_PR} lines). Decompose into smaller fixes.`,
    }
  }

  log.debug('self-healing:plan-generated', {
    dimension: win.dimension,
    estimatedDelta: pointsToFix,
    estimatedLines,
    dryRun,
  })

  return {
    dimension: win.dimension,
    branch,
    dryRun,
    estimatedDelta: pointsToFix,
    maxLinesChanged: estimatedLines,
    suggestedAction: win.suggestedAction,
    rejected: false,
  }
}
