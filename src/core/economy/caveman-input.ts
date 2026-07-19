/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { cavemanFilter, type CavemanMode } from '../llm/caveman-filter.js'

/** Target reduction for input (prompts): 75% — more aggressive than output (60%). */
export const CAVEMAN_INPUT_REDUCTION_TARGET = 0.75

const CODE_FENCE_RE = /(```[\s\S]*?```)/g
const INLINE_CODE_RE = /`[^`]+`/g

/** Strips markdown, code blocks, and verbose boilerplate from input text to reduce token usage. */
export function cavemanFilterInput(text: string, mode: CavemanMode = 'aggressive'): string {
  if (!text) return ''

  const fences: string[] = []
  const nlParts: string[] = []

  let lastIndex = 0
  let match: RegExpExecArray | null

  const fenceRe = new RegExp(CODE_FENCE_RE.source, 'g')
  while ((match = fenceRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nlParts.push(text.slice(lastIndex, match.index))
    }
    fences.push(match[1])
    lastIndex = match.index + match[1].length
  }
  if (lastIndex < text.length) {
    nlParts.push(text.slice(lastIndex))
  }

  const compressedNl = nlParts.map((part) => {
    const identifiers = new Set<string>()
    const inlineRe = new RegExp(INLINE_CODE_RE.source, 'g')
    let m: RegExpExecArray | null
    while ((m = inlineRe.exec(part)) !== null) {
      const clean = m[0].replace(/`/g, '')
      for (const word of clean.split(/[\s.]+/)) {
        if (word.length >= 2) identifiers.add(word)
      }
    }

    let out = cavemanFilter(part, mode)

    for (const id of identifiers) {
      if (!out.includes(id)) {
        out = part
        break
      }
    }

    return out
  })

  const result: string[] = []
  for (let i = 0; i < Math.max(fences.length, compressedNl.length); i++) {
    if (compressedNl[i]) result.push(compressedNl[i])
    if (fences[i]) result.push(fences[i])
  }

  return result.join('')
}

export interface CavemanInputStats {
  bytesBefore: number
  bytesAfter: number
  saved: number
  reductionPercent: number
  targetMet: boolean
  target: number
}

/**
 * Estimate caveman input compression stats without applying the filter.
 * Returns the projected savings that would be achieved.
 */
export function estimateCavemanInputReduction(text: string, mode: CavemanMode = 'aggressive'): CavemanInputStats {
  if (!text) {
    return {
      bytesBefore: 0,
      bytesAfter: 0,
      saved: 0,
      reductionPercent: 0,
      targetMet: false,
      target: CAVEMAN_INPUT_REDUCTION_TARGET,
    }
  }
  const filtered = cavemanFilterInput(text, mode)
  const bytesBefore = text.length
  const bytesAfter = filtered.length
  const saved = Math.max(0, bytesBefore - bytesAfter)
  const reductionPercent = bytesBefore > 0 ? saved / bytesBefore : 0
  return {
    bytesBefore,
    bytesAfter,
    saved,
    reductionPercent,
    targetMet: reductionPercent >= CAVEMAN_INPUT_REDUCTION_TARGET,
    target: CAVEMAN_INPUT_REDUCTION_TARGET,
  }
}
