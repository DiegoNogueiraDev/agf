/*!
 * AC harden — rewrites weak ACs into a GWT skeleton.
 * Task node_836654d6a6c9.
 *
 * WHY: Weak ACs ("the system should work") cannot be turned into deterministic
 * tests. This module rewrites them to a Given-When-Then skeleton with explicit
 * placeholder tokens so engineers can fill in concrete behaviour — stopping
 * the test-derivation gap at design time rather than at code review.
 *
 * Deterministic, zero-token. Reuses scoreAcTestability to classify strength.
 * Composes with: ac-testability.ts (strength check), ac-cmd.ts (CLI wire).
 */

import { scoreAcTestability } from './ac-testability.js'

export interface AcRewriteResult {
  original: string
  rewritten: string
  /** True when the original AC was classified as weak and a rewrite was applied. */
  wasWeak: boolean
  /**
   * True when the rewrite added zero value: the original had no observable
   * outcome verb, so wrapping it in a GWT skeleton just moved filler text
   * ("the system should work") into a template slot without producing
   * anything a deterministic test could derive from.
   */
  noop: boolean
}

const GWT_THRESHOLD = 60

/**
 * Rewrite a single AC text if it is weak (score < threshold).
 * Returns the AC unchanged when it is already strong enough.
 */
export function rewriteWeakAc(ac: string, threshold = GWT_THRESHOLD): AcRewriteResult {
  if (!ac || !ac.trim()) {
    return {
      original: ac,
      rewritten: 'Given [precondition], When [action], Then [measurable outcome]',
      wasWeak: true,
      noop: true,
    }
  }

  let result
  try {
    result = scoreAcTestability(ac)
  } catch {
    return {
      original: ac,
      rewritten: 'Given [precondition], When [action], Then [measurable outcome]',
      wasWeak: true,
      noop: true,
    }
  }

  if (result.score >= threshold) {
    return { original: ac, rewritten: ac, wasWeak: false, noop: false }
  }

  // Build skeleton: try to extract subject/verb from original text
  const trimmed = ac.trim().replace(/\.$/, '')
  const rewritten = `Given [precondition], When [${trimmed}], Then [measurable outcome]`

  // The wrap adds zero value when the original has no observable outcome verb
  // (just filler like "the system should work") — the template slot ends up
  // holding text no deterministic test can be derived from.
  return { original: ac, rewritten, wasWeak: true, noop: !result.hasObservableOutcome }
}

/**
 * Rewrite multiple ACs, returning proposals for all weak ones.
 */
export function rewriteWeakAcs(acs: string[]): AcRewriteResult[] {
  return acs.map((ac) => rewriteWeakAc(ac))
}
