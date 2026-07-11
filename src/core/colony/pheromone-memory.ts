/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §E3.1 — Pheromone memory format with evaporation_rate + last_reinforced.
 * Zero-LLM. Pure functions.
 * Formula: effective_strength = strength * e^(-rate * days_since_last_reinforced)
 */

export { DEFAULT_EVAPORATION_RATE } from '../economy/aco-params.js'
import { DEFAULT_EVAPORATION_RATE } from '../economy/aco-params.js'

export interface PheromoneMemoryInput {
  pattern: string
  tag: string
  strength: number
  date: string
  evaporation_rate?: number
  last_reinforced?: string
  improvement?: string
  tokens_saved?: number
  dora_delta?: number
  quality_delta?: number
}

export interface PheromoneMemoryContent extends PheromoneMemoryInput {
  evaporation_rate: number
  last_reinforced: string
}

export interface ParsedPheromoneMemory extends PheromoneMemoryContent {
  effective_strength: number
}

/**
 * Compute effective strength after exponential decay.
 * Formula: strength * e^(-rate * days_elapsed)
 */
export function computeEffectiveStrength(
  strength: number,
  evaporationRate: number,
  lastReinforced: Date,
  nowDate: Date = new Date(),
): number {
  const msElapsed = Math.max(0, nowDate.getTime() - lastReinforced.getTime())
  const daysElapsed = msElapsed / (1000 * 60 * 60 * 24)
  return strength * Math.exp(-evaporationRate * daysElapsed)
}

/** Build the canonical JSON string for a pheromone memory entry. */
export function buildPheromoneMemoryContent(input: PheromoneMemoryInput): string {
  const content: PheromoneMemoryContent = {
    ...input,
    evaporation_rate: input.evaporation_rate ?? DEFAULT_EVAPORATION_RATE,
    last_reinforced: input.last_reinforced ?? new Date().toISOString(),
  }
  return JSON.stringify(content, null, 2)
}

/** Default minimum deposited-trail count below which a read is skipped (cold colony). */
export const DEFAULT_LAZY_TRAIL_THRESHOLD = 1

export interface LazyPheromoneReadOptions {
  /** Minimum deposited-trail count required before the read runs. Default 1. */
  threshold?: number
}

/**
 * Lazy guard for pheromone-trail reads.
 *
 * The loop reads trails every cycle even on a cold colony where nothing has been
 * deposited yet — wasted work. This skips the `read` entirely and returns `[]`
 * when `depositedCount` is below the threshold N (default 1), so a new project
 * pays zero read cost. Once ≥ N trails exist, `read` runs exactly once and its
 * result is returned verbatim.
 *
 * Pure and deterministic: the side-effecting read is injected by the caller.
 */
export function readPheromoneTrailsLazy<T>(
  depositedCount: number,
  read: () => readonly T[],
  options: LazyPheromoneReadOptions = {},
): readonly T[] {
  const threshold = options.threshold ?? DEFAULT_LAZY_TRAIL_THRESHOLD
  if (depositedCount < threshold) return []
  return read()
}

/**
 * Parse a pheromone memory JSON string and compute effective_strength.
 * Returns null if parsing fails or required fields are missing.
 */
export function parsePheromoneMemoryContent(content: string, nowDate: Date = new Date()): ParsedPheromoneMemory | null {
  try {
    const parsed = JSON.parse(content) as Partial<PheromoneMemoryContent>
    if (typeof parsed.strength !== 'number') return null

    const rate = typeof parsed.evaporation_rate === 'number' ? parsed.evaporation_rate : DEFAULT_EVAPORATION_RATE
    const lastReinforced = parsed.last_reinforced ? new Date(parsed.last_reinforced) : nowDate
    const effective_strength = computeEffectiveStrength(parsed.strength, rate, lastReinforced, nowDate)

    return {
      pattern: parsed.pattern ?? '',
      tag: parsed.tag ?? '',
      strength: parsed.strength,
      date: parsed.date ?? '',
      evaporation_rate: rate,
      last_reinforced: lastReinforced.toISOString(),
      improvement: parsed.improvement,
      tokens_saved: parsed.tokens_saved,
      dora_delta: parsed.dora_delta,
      quality_delta: parsed.quality_delta,
      effective_strength,
    }
  } catch {
    return null
  }
}
