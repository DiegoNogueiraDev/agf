/*!
 * Run-on AC detector — warns authors when a single acceptance criterion is a
 * prose blob that should be split into multiple discrete testable criteria.
 *
 * WHY: INVEST T (testable) and E (estimable) scores drop when one AC contains
 * multiple conditions joined by semicolons or is excessively long.
 * The DoD ac_quality_pass threshold is 60; a run-on AC commonly scores 57.
 *
 * Composes with: ac-validator.ts (INVEST scoring), node-cmd.ts (CLI warning).
 */

/** Maximum characters for a single AC before it's considered run-on. */
const MAX_AC_CHARS = 120

/** Minimum semicolons in a single AC string to classify it as run-on. */
const SEMICOLONS_FOR_RUN_ON = 1

export interface RunOnAcWarning {
  /** Human-readable authoring guidance. */
  message: string
  /** Suggested split: each semicolon-delimited phrase trimmed. */
  splitSuggestion: string[]
}

/**
 * Inspect a list of ACs and return a warning if any single entry looks like
 * a run-on criterion (semicolons or excessive length). Returns null when the
 * list looks well-formed.
 */
export function detectRunOnAc(acs: string[]): RunOnAcWarning | null {
  for (const ac of acs) {
    const semicolonCount = (ac.match(/;/g) ?? []).length
    const isLong = ac.length > MAX_AC_CHARS
    const hasMultipleClauses = semicolonCount >= SEMICOLONS_FOR_RUN_ON

    if (hasMultipleClauses || isLong) {
      const splitSuggestion = ac
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)

      return {
        message:
          'Run-on AC detected. Split into multiple discrete, testable criteria ' +
          '(each --ac entry should cover exactly one Given/When/Then condition). ' +
          'Multiple discrete --ac entries score higher on INVEST E/T dimensions.',
        splitSuggestion,
      }
    }
  }
  return null
}
