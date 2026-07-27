/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Shared grading utility — converts numeric scores (0-100) to letter grades.
 *
 * Thresholds: 90→A, 75→B, 60→C, 40→D, <40→F
 */

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'

/** scoreToGrade —  */
export function scoreToGrade(score: number): Grade {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 60) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}
