/*!
 * AC ambiguity linter — flags vague quality phrases in acceptance criteria.
 * Task node_55defb4a8e9f.
 *
 * WHY: ACs like "should be fast" are untestable without a numeric threshold.
 * This linter surfaces the vague term and suggests a concrete rewrite so
 * the conducting agent can apply it via `agf node update --ac`.
 * Pure, ~0 token; complements detect-ambiguity.ts (gap-level) with inline lint.
 *
 * Composes with: ac-testability.ts (scoring), ac-harden.ts (rewrite).
 */

/** Performance/quality adjectives that require numeric evidence to be testable. */
const VAGUE_PATTERNS: Array<{ pattern: RegExp; term: string }> = [
  { pattern: /\bfast\b/i, term: 'fast' },
  { pattern: /\bslow\b/i, term: 'slow' },
  { pattern: /\bquick(?:ly)?\b/i, term: 'quick' },
  { pattern: /\bperformant\b/i, term: 'performant' },
  { pattern: /\bresponsive\b/i, term: 'responsive' },
  { pattern: /\beasy\s+to\s+use\b/i, term: 'easy to use' },
  { pattern: /\buser.friendly\b/i, term: 'user-friendly' },
  { pattern: /\bscalabl[e]?\b/i, term: 'scalable' },
  { pattern: /\breliable\b/i, term: 'reliable' },
  { pattern: /\bstable\b/i, term: 'stable' },
  { pattern: /\bacceptable\b/i, term: 'acceptable' },
  { pattern: /\bshould\s+work\b/i, term: 'should work' },
  { pattern: /\bshould\s+(?:be\s+)?(?:fast|slow|quick|performant|responsive|easy)\b/i, term: 'should be [vague]' },
  { pattern: /\bminimal\s+(?:latency|delay)\b/i, term: 'minimal latency/delay' },
]

/** Patterns indicating a numeric/boolean threshold is already present. */
const QUANTIFIED =
  /\d+\s*(?:ms|s|sec|min|%|mb|gb|kb|req\/s|rps|rpm)\b|\b(?:200|201|204|400|401|403|404|500)\b|true|false/i

export interface AcLintResult {
  ac: string
  ambiguous: boolean
  vagueTerms: string[]
  suggestion: string
}

/**
 * Lint a single AC text for vague quality terms that need measurable thresholds.
 * Returns ambiguous=false when the AC already contains a numeric/boolean qualifier.
 */
export function lintAcAmbiguity(ac: string): AcLintResult {
  if (QUANTIFIED.test(ac)) {
    return { ac, ambiguous: false, vagueTerms: [], suggestion: '' }
  }

  const vagueTerms: string[] = []
  for (const { pattern, term } of VAGUE_PATTERNS) {
    if (pattern.test(ac) && !vagueTerms.includes(term)) {
      vagueTerms.push(term)
    }
  }

  if (vagueTerms.length === 0) {
    return { ac, ambiguous: false, vagueTerms: [], suggestion: '' }
  }

  return {
    ac,
    ambiguous: true,
    vagueTerms,
    suggestion: `Definir limite mensurável para: ${vagueTerms.join(', ')} — ex.: "< 200ms", "> 99%", "≤ 50MB"`,
  }
}

/** Lint a batch of AC texts, returning only the ambiguous ones. */
export function lintAcsBatch(acs: string[]): AcLintResult[] {
  return acs.map(lintAcAmbiguity).filter((r) => r.ambiguous)
}
