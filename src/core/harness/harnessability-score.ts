/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Harnessability Score -- Composite metric for agent-readiness
 *
 * Combines 9 dimensions (v4):
 * - Type Coverage        (25%): files without `any` usage
 * - Test Coverage        (25%): modules with test files
 * - Fitness Score        (10%): architecture fitness functions passing
 * - Docs Coverage        (10%): CLAUDE.md, README, rules, docs/
 * - Naming Clarity       (10%): descriptive variable/function names
 * - Error Handling       ( 5%): typed errors, no swallowed catches
 * - Context Density      ( 5%): JSDoc coverage on exported functions
 * - Provenance Coverage  ( 5%): proportion of nodes with source_file receipt
 * - Connectivity         ( 5%): core capabilities reachable from ≥1 surface
 *
 * Based on: "Harness Engineering for Coding Agent Users" (Böckeler, Thoughtworks 2026)
 * Concept: Harnessability -- structural properties that enable effective harnesses.
 */

export interface HarnessabilityInput {
  typeScore: number
  testScore: number
  fitnessScore: number
  docsScore: number
  /** Optional (v2) -- defaults to 100 when omitted */
  namingScore?: number
  /** Optional (v2) -- defaults to 100 when omitted */
  errorHandlingScore?: number
  /** Optional (v2) -- defaults to 100 when omitted */
  contextDensityScore?: number
  /** Optional (v3) -- defaults to 100 when omitted (no DB available) */
  provenanceScore?: number
  /** Optional (v4) -- defaults to 100 when omitted (scan not run) */
  connectivityScore?: number
}

export interface DimensionBreakdown {
  score: number
  weight: number
}

export interface HarnessabilityResult {
  score: number
  grade: 'A' | 'B' | 'C' | 'D'
  breakdown: {
    types: DimensionBreakdown
    tests: DimensionBreakdown
    fitness: DimensionBreakdown
    docs: DimensionBreakdown
    naming: DimensionBreakdown
    errors: DimensionBreakdown
    context: DimensionBreakdown
    provenance: DimensionBreakdown
    connectivity: DimensionBreakdown
  }
}

const WEIGHTS = {
  types: 0.25,
  tests: 0.25,
  fitness: 0.1,
  docs: 0.1,
  naming: 0.1,
  errors: 0.05,
  context: 0.05,
  provenance: 0.05,
  connectivity: 0.05,
} as const

function gradeFromScore(score: number): 'A' | 'B' | 'C' | 'D' {
  if (score >= 85) return 'A'
  if (score >= 70) return 'B'
  if (score >= 55) return 'C'
  return 'D'
}

/**
 * Compute the composite harnessability score from 8 dimensions.
 * New dimensions (naming, errors, context, provenance) are optional and default to 100
 * for backward compatibility with callers that do not provide a DB connection.
 */
export function computeHarnessabilityScore(input: HarnessabilityInput): HarnessabilityResult {
  const naming = input.namingScore ?? 100
  const errors = input.errorHandlingScore ?? 100
  const context = input.contextDensityScore ?? 100
  const provenance = input.provenanceScore ?? 100
  const connectivity = input.connectivityScore ?? 100

  const score =
    input.typeScore * WEIGHTS.types +
    input.testScore * WEIGHTS.tests +
    input.fitnessScore * WEIGHTS.fitness +
    input.docsScore * WEIGHTS.docs +
    naming * WEIGHTS.naming +
    errors * WEIGHTS.errors +
    context * WEIGHTS.context +
    provenance * WEIGHTS.provenance +
    connectivity * WEIGHTS.connectivity

  const rounded = Math.round(score * 10) / 10

  return {
    score: rounded,
    grade: gradeFromScore(rounded),
    breakdown: {
      types: { score: input.typeScore, weight: WEIGHTS.types },
      tests: { score: input.testScore, weight: WEIGHTS.tests },
      fitness: { score: input.fitnessScore, weight: WEIGHTS.fitness },
      docs: { score: input.docsScore, weight: WEIGHTS.docs },
      naming: { score: naming, weight: WEIGHTS.naming },
      errors: { score: errors, weight: WEIGHTS.errors },
      context: { score: context, weight: WEIGHTS.context },
      provenance: { score: provenance, weight: WEIGHTS.provenance },
      connectivity: { score: connectivity, weight: WEIGHTS.connectivity },
    },
  }
}
