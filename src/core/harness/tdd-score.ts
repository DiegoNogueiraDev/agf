/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * TDD Score — Quantitative quality metric for task test suites.
 *
 * Computes a 0–100 score from three dimensions:
 *   1. Coverage (40%): does the task have test files with assertions?
 *   2. Assertion Diversity (35%): are different assertion types used?
 *   3. Test Density (25%): assertions per source line (heuristic for thoroughness)
 *
 * When score < 60, specific remediation actions are suggested.
 *
 * Based on: Khorikov (2020) — Four Pillars of Unit Testing
 * and Meszaros (2007) — xUnit Test Patterns.
 */

// ── Types ───────────────────────────────────────────────

export interface TddScoreInput {
  /** Number of test files associated with the task */
  testFileCount: number
  /** Total assertions across all test files */
  totalAssertions: number
  /** Unique assertion types used (e.g., 'toBe', 'toEqual', 'toMatch') */
  assertionTypes: string[]
  /** Source lines covered by tests (0 if unknown) */
  sourceLinesCovered?: number
  /** Total source lines (0 if unknown) */
  sourceLinesTotal?: number
}

export interface TddScoreResult {
  /** Overall score 0–100 */
  score: number
  /** Coverage sub-score 0–100 */
  coverageScore: number
  /** Assertion diversity sub-score 0–100 */
  diversityScore: number
  /** Test density sub-score 0–100 */
  densityScore: number
  /** Letter grade: A ≥ 80, B ≥ 60, C ≥ 40, else D */
  grade: 'A' | 'B' | 'C' | 'D'
  /** Suggested remediation actions (when score < 60) */
  suggestions: string[]
  /** Whether tests exist */
  hasTests: boolean
}

// ── Assertion Pattern Detection ─────────────────────────

/**
 * Patterns that indicate distinct assertion types.
 * Grouped by semantic category (Khorikov Pillar 2: State Verification).
 */
const ASSERTION_PATTERNS: Array<{ type: string; regex: RegExp }> = [
  { type: 'equality', regex: /\.toBe\(/ },
  { type: 'deep-equal', regex: /\.toEqual\(/ },
  { type: 'truthiness', regex: /\.toBeTruthy\(/ },
  { type: 'falsy', regex: /\.toBeFalsy\(/ },
  { type: 'null', regex: /\.toBeNull\(/ },
  { type: 'undefined', regex: /\.toBeUndefined\(/ },
  { type: 'NaN', regex: /\.toBeNaN\(/ },
  { type: 'greater', regex: /\.toBeGreaterThan\(/ },
  { type: 'less', regex: /\.toBeLessThan\(/ },
  { type: 'close-to', regex: /\.toBeCloseTo\(/ },
  { type: 'string-match', regex: /\.toMatch\(/ },
  { type: 'contains', regex: /\.toContain\(/ },
  { type: 'length', regex: /\.toHaveLength\(/ },
  { type: 'property', regex: /\.toHaveProperty\(/ },
  { type: 'throw', regex: /\.toThrow\(/ },
  { type: 'instanceof', regex: /\.toBeInstanceOf\(/ },
  { type: 'snapshot', regex: /\.toMatchSnapshot\(/ },
  { type: 'resolves', regex: /\.resolves\./ },
  { type: 'rejects', regex: /\.rejects\./ },
  { type: 'called', regex: /\.toHaveBeenCalled/ },
  { type: 'called-with', regex: /\.toHaveBeenCalledWith/ },
  { type: 'called-times', regex: /\.toHaveBeenCalledTimes/ },
  { type: 'array-includes', regex: /\.arrayContaining/ },
  { type: 'object-includes', regex: /\.objectContaining/ },
  { type: 'string-includes', regex: /\.stringContaining/ },
  // ── Java: JUnit 5 + AssertJ + Hamcrest ────────────────
  // Tokens below are Java-distinctive (assertX(…) / fluent .isX(…)) and never
  // appear in Vitest/Jest content, so TS/JS scoring stays byte-identical while
  // polyglot repos stop scoring 0/0. Categories are reused from the JS families
  // above so assertion-diversity scoring shares one vocabulary across languages.
  { type: 'equality', regex: /\bassertEquals\s*\(|\.isEqualTo\s*\(/ },
  { type: 'deep-equal', regex: /\bassertArrayEquals\s*\(|\.containsExactly\s*\(/ },
  { type: 'truthiness', regex: /\bassertTrue\s*\(|\.isTrue\s*\(/ },
  { type: 'falsy', regex: /\bassertFalse\s*\(|\.isFalse\s*\(/ },
  { type: 'null', regex: /\bassertNull\s*\(|\.isNull\s*\(/ },
  { type: 'not-null', regex: /\bassertNotNull\s*\(|\.isNotNull\s*\(/ },
  { type: 'throw', regex: /\bassertThrows\s*\(|\bassertThatThrownBy\s*\(|\.isThrownBy\s*\(/ },
  { type: 'instanceof', regex: /\.isInstanceOf\s*\(/ },
  { type: 'greater', regex: /\.isGreaterThan\s*\(/ },
  { type: 'less', regex: /\.isLessThan\s*\(/ },
  { type: 'length', regex: /\.hasSize\s*\(/ },
  { type: 'string-match', regex: /\.matches\s*\(/ },
]

/**
 * Extract unique assertion types from test file content.
 */
export function extractAssertionTypes(content: string): string[] {
  const found = new Set<string>()
  for (const { type, regex } of ASSERTION_PATTERNS) {
    if (regex.test(content)) {
      found.add(type)
    }
  }
  return [...found]
}

/**
 * Assertion-call entry points, per ecosystem. Each match is the START of one
 * assertion statement — the fluent tail of an AssertJ chain (`.isEqualTo(…)`)
 * is intentionally NOT counted, so `assertThat(x).isEqualTo(y)` is one, not two.
 * `expect\(` is kept first and verbatim so TS/JS counts stay byte-identical.
 */
const ASSERTION_CALL_REGEX =
  /expect\(|\bassertThat\s*\(|\bassertEquals\s*\(|\bassertArrayEquals\s*\(|\bassertTrue\s*\(|\bassertFalse\s*\(|\bassertNull\s*\(|\bassertNotNull\s*\(|\bassertSame\s*\(|\bassertNotSame\s*\(|\bassertThrows\s*\(|\bassertThatThrownBy\s*\(|\bassertDoesNotThrow\s*\(|\bassertIterableEquals\s*\(|\bassertLinesMatch\s*\(/g

/**
 * Count assertions in test file content.
 * Matches TS/JS `expect(...)` and Java (JUnit 5 / AssertJ) `assertThat(...)` /
 * `assertX(...)` entry points.
 */
export function countAssertions(content: string): number {
  const matches = content.match(ASSERTION_CALL_REGEX)
  return matches?.length ?? 0
}

// ── Scoring Functions ───────────────────────────────────

/**
 * Coverage score: 0 if no tests, scales with assertion count.
 * Thresholds based on empirical data from Khorikov's pillars.
 */
function computeCoverageScore(testFileCount: number, totalAssertions: number): number {
  if (testFileCount === 0 || totalAssertions === 0) return 0

  // File presence: up to 30 points
  const fileScore = Math.min(testFileCount * 10, 30)

  // Assertion count: up to 70 points
  // 0-5 assertions = 10pts, 5-15 = 30pts, 15-30 = 50pts, 30+ = 70pts
  let assertionScore: number
  if (totalAssertions < 5) assertionScore = 10
  else if (totalAssertions < 15) assertionScore = 30
  else if (totalAssertions < 30) assertionScore = 50
  else assertionScore = 70

  return Math.min(fileScore + assertionScore, 100)
}

/**
 * Assertion diversity score: more types = higher score.
 * Based on Meszaros' assertion variety principle.
 */
function computeDiversityScore(assertionTypes: string[]): number {
  const count = assertionTypes.length
  if (count === 0) return 0

  // 1 type = 20, 2 = 35, 3 = 50, 4 = 65, 5 = 75, 6+ = 85-100
  if (count === 1) return 20
  if (count === 2) return 35
  if (count === 3) return 50
  if (count === 4) return 65
  if (count === 5) return 75
  if (count <= 7) return 85
  if (count <= 10) return 95
  return 100
}

/**
 * Test density score: assertions per source line.
 * Ideal range: 0.02–0.10 assertions per line (2–10% density).
 */
function computeDensityScore(totalAssertions: number, sourceLinesCovered: number, sourceLinesTotal: number): number {
  const lines = sourceLinesTotal || sourceLinesCovered || 0
  if (lines === 0 || totalAssertions === 0) return 50 // no data = neutral

  const density = totalAssertions / lines

  // Bell curve centered at 0.05 (5% density)
  if (density < 0.01) return 10
  if (density < 0.02) return 30
  if (density < 0.05) return 60
  if (density < 0.1) return 80
  if (density < 0.2) return 90
  return 100 // very thorough
}

// ── Remediation Suggestions ─────────────────────────────

function generateSuggestions(result: {
  coverageScore: number
  diversityScore: number
  densityScore: number
  testFileCount: number
  totalAssertions: number
  assertionTypes: string[]
}): string[] {
  const suggestions: string[] = []

  if (result.testFileCount === 0) {
    suggestions.push('No test files found. Create at least one test file with assertions.')
    return suggestions
  }

  if (result.totalAssertions < 5) {
    suggestions.push('Add more assertions (currently < 5). Aim for 10+ assertions per test file.')
  }

  if (result.assertionTypes.length < 3) {
    suggestions.push(
      `Only ${result.assertionTypes.length} assertion type(s) used. Diversify with: toBe, toEqual, toThrow, toContain, toMatch.`,
    )
  }

  if (result.coverageScore < 40) {
    suggestions.push('Coverage is low. Ensure each branch and edge case has a corresponding test.')
  }

  if (result.densityScore < 40) {
    suggestions.push('Test density is low. Add assertions for boundary conditions and error paths.')
  }

  if (result.assertionTypes.includes('snapshot') && result.assertionTypes.length < 3) {
    suggestions.push('Heavy snapshot usage without other assertion types. Add explicit state assertions.')
  }

  return suggestions
}

// ── Main Scoring Function ───────────────────────────────

const WEIGHTS = { coverage: 0.4, diversity: 0.35, density: 0.25 }

/**
 * Compute TDD score for a task's test suite.
 */
export function computeTddScore(input: TddScoreInput): TddScoreResult {
  const hasTests = input.testFileCount > 0 && input.totalAssertions > 0

  if (!hasTests) {
    return {
      score: 0,
      coverageScore: 0,
      diversityScore: 0,
      densityScore: 0,
      grade: 'D',
      suggestions: ['No tests found. Create test files with assertions to enable TDD scoring.'],
      hasTests: false,
    }
  }

  const coverageScore = computeCoverageScore(input.testFileCount, input.totalAssertions)
  const diversityScore = computeDiversityScore(input.assertionTypes)
  const densityScore = computeDensityScore(
    input.totalAssertions,
    input.sourceLinesCovered ?? 0,
    input.sourceLinesTotal ?? 0,
  )

  const score = Math.round(
    coverageScore * WEIGHTS.coverage + diversityScore * WEIGHTS.diversity + densityScore * WEIGHTS.density,
  )

  const clamped = Math.max(0, Math.min(100, score))

  let grade: 'A' | 'B' | 'C' | 'D'
  if (clamped >= 80) grade = 'A'
  else if (clamped >= 60) grade = 'B'
  else if (clamped >= 40) grade = 'C'
  else grade = 'D'

  const suggestions =
    clamped < 60
      ? generateSuggestions({
          coverageScore,
          diversityScore,
          densityScore,
          testFileCount: input.testFileCount,
          totalAssertions: input.totalAssertions,
          assertionTypes: input.assertionTypes,
        })
      : []

  return {
    score: clamped,
    coverageScore,
    diversityScore,
    densityScore,
    grade,
    suggestions,
    hasTests: true,
  }
}
