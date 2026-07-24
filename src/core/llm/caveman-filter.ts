/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-8.T01 + E7 — Caveman mode output filter with graduated modes.
 *
 * Modes:
 *   light      — articles + filler words (~30% reduction)
 *   medium     — light + hedges + transitions (~50% reduction)
 *   aggressive — medium + whitespace/punctuation collapse (~75% reduction)
 *
 * Configurable via project_settings: caveman_mode = light|medium|aggressive
 * Default (caveman=true): aggressive
 */

export type CavemanMode = 'light' | 'medium' | 'aggressive'

export const CAVEMAN_REDUCTION_TARGET = 0.4

const ARTICLES = /\b(?:the|a|an)\b/gi

const FILLER_PHRASES: RegExp[] = [
  /\b(?:actually|basically|essentially|literally|honestly|obviously|simply|just|really|very|quite|rather)\b/gi,
  /\b(?:in order to)\b/gi,
  /\b(?:as a matter of fact)\b/gi,
  /\b(?:to be honest)\b/gi,
  /\b(?:at the end of the day)\b/gi,
]

const HEDGES: RegExp[] = [
  /\b(?:i think(?: that)?|i believe(?: that)?|i'd say(?: that)?|i would say(?: that)?|in my opinion|it seems(?: that)?|it appears(?: that)?|maybe|perhaps|probably|possibly|kind of|sort of|somewhat)\b/gi,
]

const TRANSITION_FLUFF: RegExp[] = [
  /\b(?:furthermore|moreover|additionally|consequently|therefore|thus|hence|so)[,:]?\s+/gi,
  /\b(?:however|nonetheless|nevertheless),\s+/gi,
]

const REDUCTION_TARGETS: Record<CavemanMode, number> = {
  light: 0.7, // output ≤ 70% of original (30% reduction)
  medium: 0.5, // output ≤ 50% of original (50% reduction)
  aggressive: 0.4, // output ≤ 40% of original (60% reduction)
}

/** Return the token-reduction target ratio for a caveman filter mode. */
export function getReductionTarget(mode: CavemanMode): number {
  return REDUCTION_TARGETS[mode]
}

/** Apply progressive text compression (articles, hedges, whitespace) at the specified intensity mode. */
export function cavemanFilter(text: string, mode: CavemanMode = 'aggressive'): string {
  if (!text) return ''
  let out = text

  // All modes: articles + filler
  for (const re of FILLER_PHRASES) out = out.replace(re, '')
  out = out.replace(ARTICLES, '')

  // Medium + aggressive: hedges + transitions
  if (mode === 'medium' || mode === 'aggressive') {
    for (const re of HEDGES) out = out.replace(re, '')
    for (const re of TRANSITION_FLUFF) out = out.replace(re, '')
  }

  // Aggressive only: whitespace/punctuation collapse
  if (mode === 'aggressive') {
    out = out
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/([,.;:!?])\1+/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s,]+|[\s,]+$/gm, '')
  }

  return out.trim()
}

/** Return true when settings enable caveman filtering (explicit flag or mode set). */
export function shouldCavemanFilter(settings: { caveman?: boolean | null; cavemanMode?: string | null }): boolean {
  return settings.caveman === true || settings.cavemanMode != null
}

/** Resolve the CavemanMode from settings, defaulting to 'aggressive'. */
export function getCavemanMode(settings: { cavemanMode?: string | null }): CavemanMode {
  const m = settings.cavemanMode
  if (m === 'light' || m === 'medium' || m === 'aggressive') return m
  return 'aggressive'
}
