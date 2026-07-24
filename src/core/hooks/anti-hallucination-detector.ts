/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-13.3 — Anti-hallucination Guardrails
 *
 * Pure detector for forbidden hand-wave phrases. Used by the
 * `task:pre-execute` hook handler to surface advisory warnings, and
 * exposed for direct invocation from validators and CI scripts.
 *
 * Rule reference: .claude/rules/anti-hallucination.md
 */

export const BANNED_PHRASES = [
  'standard practice',
  'typically',
  'obviously',
  'normally',
  'as expected',
  'best practice',
  'common pattern',
  'generally',
] as const

export type BannedPhrase = (typeof BANNED_PHRASES)[number]

const MULTI_WORD_RE = /\s/

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matcherFor(phrase: string): RegExp {
  // Single tokens use word boundaries to avoid matching inside larger words
  // ("normally" must not match "normalize"). Multi-word phrases use case-
  // insensitive substring with leading/trailing word boundaries on the ends.
  // §EPIC-13.3 — input is escapeRegex'd above and BANNED_PHRASES is a
  // compile-time constant, so the regex source is not user-controlled.
  const escaped = escapeRegex(phrase)
  if (MULTI_WORD_RE.test(phrase)) {
    // eslint-disable-next-line security/detect-non-literal-regexp
    return new RegExp(`\\b${escaped}\\b`, 'i')
  }
  // eslint-disable-next-line security/detect-non-literal-regexp
  return new RegExp(`\\b${escaped}\\b`, 'i')
}

const MATCHERS: ReadonlyArray<{ phrase: BannedPhrase; re: RegExp }> = BANNED_PHRASES.map((phrase) => ({
  phrase,
  re: matcherFor(phrase),
}))

/** detectBannedPhrases —  */
export function detectBannedPhrases(text: string | undefined | null): BannedPhrase[] {
  if (!text || typeof text !== 'string') return []
  const hits: BannedPhrase[] = []
  for (const { phrase, re } of MATCHERS) {
    if (re.test(text)) hits.push(phrase)
  }
  return hits
}
