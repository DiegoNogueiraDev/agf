/*!
 * safe-regexp — ReDoS guard for user-supplied regex patterns.
 *
 * WHY: Policy engine, TOML pipelines, and custom filters compile patterns from
 * config. A malicious or accidental pattern like `(a+)+` causes catastrophic
 * backtracking (ReDoS) and hangs the process. This module applies two guards:
 *   1. Max length cap — rejects patterns > MAX_PATTERN_LENGTH chars.
 *   2. Nested-quantifier heuristic — rejects patterns matching known ReDoS shapes.
 *
 * Returns null (not throw) so callers can skip the dangerous pattern gracefully.
 * Composes with: exec-policy-engine.ts, toml-pipeline.ts, custom-filters.ts.
 */

import { createLogger } from './logger.js'

const log = createLogger({ layer: 'core', source: 'safe-regexp.ts' })

/** Patterns longer than this are rejected regardless of content. */
const MAX_PATTERN_LENGTH = 500

/**
 * Detect shapes that cause catastrophic backtracking (ReDoS).
 * Catches:
 *   - Nested quantifiers: `(a+)+`, `(a*)*`, `(a+)*`
 *   - Overlapping alternation with outer quantifier: `(a|aa)+`, `(ab|a)+`
 * Conservative: rejects any group containing `+`, `*`, or `|` followed by `+`/`*`.
 * `(foo|bar)+` is technically safe but rejected here — acceptable for policy/config contexts.
 */
const REDOS_RE = /\([^)]*(?:[+*]|[|])[^)]*\)[+*]/

/**
 * Compile a user-supplied pattern safely.
 * Returns null and logs a warning when the pattern is dangerous or invalid.
 */
export function safeCompileRegex(pattern: string): RegExp | null {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    log.warn('safe-regexp:rejected:too-long', { length: pattern.length, max: MAX_PATTERN_LENGTH })
    return null
  }

  if (REDOS_RE.test(pattern)) {
    log.warn('safe-regexp:rejected:nested-quantifier', { pattern: pattern.slice(0, 80) })
    return null
  }

  try {
    return new RegExp(pattern) // eslint-disable-line security/detect-non-literal-regexp
  } catch (err) {
    log.warn('safe-regexp:rejected:invalid', {
      pattern: pattern.slice(0, 80),
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Compile an array of patterns, skipping dangerous or invalid ones.
 * Never throws — malformed entries are logged and omitted.
 */
export function safeCompileRegexes(patterns: string[] | undefined): RegExp[] {
  const out: RegExp[] = []
  for (const p of patterns ?? []) {
    const re = safeCompileRegex(p)
    if (re) out.push(re)
  }
  return out
}
