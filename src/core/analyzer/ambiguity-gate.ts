/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Ambiguity gate (M6). Promotes the advisory `ambiguity-audit` skill to a
 * deterministic classifier: each AC is SPECIFIED / PARTIALLY / UNSPECIFIED based
 * on weasel terms + concreteness. Zero-token. Reuses {@link ALL_VAGUE_TERMS} and
 * {@link parseAc}. Word-boundary matching avoids false positives (e.g.
 * "bombardment" must not match "bom").
 */

import { ALL_VAGUE_TERMS } from './vague-terms.js'
import { parseAc } from './ac-parser.js'

export type AmbiguityLevel = 'specified' | 'partially' | 'unspecified'

export interface AmbiguityResult {
  ac: string
  level: AmbiguityLevel
  /** The weasel terms found (empty when specified). */
  vagueTerms: string[]
}

/** Find weasel terms: whole-word match for single words, substring for phrases. */
function findVagueTerms(ac: string): string[] {
  const lower = ac.toLowerCase()
  const words = new Set(lower.split(/[^\p{L}\p{N}]+/u).filter(Boolean))
  // Multi-token terms (space or hyphen) match as substrings; single words match
  // whole-word so "bombardment" never matches "bom".
  return ALL_VAGUE_TERMS.filter((t) => (/[\s-]/.test(t) ? lower.includes(t) : words.has(t)))
}

/**
 * Classify an AC's specification level:
 * - specified: no weasel terms.
 * - partially: weasel term(s) but the AC is concrete (GWT or measurable).
 * - unspecified: weasel term(s) and no concreteness → needs clarification.
 */
export function classifyAmbiguity(ac: string): AmbiguityResult {
  const vagueTerms = findVagueTerms(ac)
  if (vagueTerms.length === 0) return { ac, level: 'specified', vagueTerms: [] }
  const parsed = parseAc(ac)
  const concrete = parsed.format === 'gwt' || parsed.isMeasurable
  return { ac, level: concrete ? 'partially' : 'unspecified', vagueTerms }
}
