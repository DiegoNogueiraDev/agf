/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { DEFAULT_EVAPORATION_RATE } from '../economy/aco-params.js'

export const DECAY_RATE = DEFAULT_EVAPORATION_RATE
const EPSILON = 0.1

export interface PheromonMemory {
  name: string
  content: string
}

export interface DecayedTrail extends PheromonMemory {
  effectiveStrength: number
}

export function computeEffectiveStrength(content: string, now: Date): number {
  try {
    const data = JSON.parse(content) as Record<string, unknown>
    const strength = typeof data.strength === 'number' ? data.strength : 0
    if (strength === 0) return 0
    const refDate = typeof data.date === 'string' ? new Date(data.date) : now
    const days = (now.getTime() - refDate.getTime()) / (24 * 60 * 60 * 1000)
    return strength * Math.exp(-DEFAULT_EVAPORATION_RATE * Math.max(0, days))
  } catch {
    return 0
  }
}

export function applyDecayFilter(trails: PheromonMemory[], now: Date): DecayedTrail[] {
  return trails
    .map((t) => ({ ...t, effectiveStrength: computeEffectiveStrength(t.content, now) }))
    .filter((t) => t.effectiveStrength >= EPSILON)
    .sort((a, b) => b.effectiveStrength - a.effectiveStrength)
}
