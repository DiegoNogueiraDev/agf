/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * INVEST Validator — gates decomposition candidates against the INVEST criteria.
 *
 * Checks applied:
 *   V — Valuable: at least 1 AC present
 *   E — Estimable: xpSize must be set
 *   S — Small: xpSize must be XS/S/M (not L/XL)
 *   T — Testable: at least one AC matches GIVEN/WHEN/THEN or contains "should"
 *
 * I (Independent) and N (Negotiable) require full graph context and are left
 * to human review — this validator enforces the mechanically checkable subset.
 */

import { createLogger } from '../utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'planner/invest-validator.ts' })

export type XpSize = 'XS' | 'S' | 'M' | 'L' | 'XL'

export interface InvestCandidate {
  title: string
  description?: string
  xpSize?: XpSize
  acceptanceCriteria: string[]
}

export interface InvestResult {
  passed: boolean
  rejectedReasons: string[]
}

const TESTABLE_PATTERN = /given|when|then|should/i

/** Return true if the AC text carries a testable assertion */
function isTestableAc(ac: string): boolean {
  return TESTABLE_PATTERN.test(ac)
}

/** validateInvest —  */
export function validateInvest(candidate: InvestCandidate): InvestResult {
  const reasons: string[] = []

  // Valuable — must have at least 1 AC
  if (!candidate.acceptanceCriteria || candidate.acceptanceCriteria.length === 0) {
    reasons.push('Valuable: no acceptance criteria — at least 1 AC required')
  }

  // Estimable — must have xpSize
  if (!candidate.xpSize) {
    reasons.push('Estimable: xpSize is missing — cannot estimate effort')
  }

  // Small — xpSize must be XS/S/M
  if (candidate.xpSize === 'L' || candidate.xpSize === 'XL') {
    reasons.push(`Small: xpSize "${candidate.xpSize}" is too large — decompose further to S or M`)
  }

  // Testable — at least 1 AC must be testable
  const hasTestableAc = candidate.acceptanceCriteria?.some(isTestableAc) ?? false
  if (candidate.acceptanceCriteria && candidate.acceptanceCriteria.length > 0 && !hasTestableAc) {
    reasons.push("Testable: no AC contains GIVEN/WHEN/THEN or 'should' — add concrete assertions")
  }

  return { passed: reasons.length === 0, rejectedReasons: reasons }
}
