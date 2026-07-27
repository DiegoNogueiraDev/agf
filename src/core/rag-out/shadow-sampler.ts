/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Shadow sampling for empirical baseline estimation (PRD 4.4, method 1).
 *
 * In 1 of every N tasks, the caller runs BOTH the RAG path AND the pure-LLM
 * path, recording the LLM token count as the real baseline. The other N-1
 * tasks use the running shadow mean instead of the structural estimate.
 *
 * Honesty rule: entries carry `baselineMethod: 'shadow_sample'` so reports
 * never conflate shadow-measured economy with structural estimates.
 */

export interface ShadowEntry {
  nodeId?: string
  lever: 'rag_in_reuse' | 'rag_out_recovery'
  /** Tokens the pure-LLM path actually used (the real baseline). */
  baselineTokens: number
  /** Tokens the RAG path used (the actual cost). */
  actualTokens: number
  baselineMethod: 'shadow_sample'
  timestamp: number
}

export interface ShadowSampler {
  /** Returns true if this task should be shadow-sampled (1-in-N counter). */
  shouldSample(): boolean
  /** Record a shadow measurement from a dual run. */
  record(entry: ShadowEntry): void
  /** Arithmetic mean of baselineTokens for the given lever; 0 if no samples. */
  meanBaseline(lever: ShadowEntry['lever']): number
  readonly samples: readonly ShadowEntry[]
}

const DEFAULT_N = 10

export function createShadowSampler(opts?: { n?: number }): ShadowSampler {
  const n = Math.max(1, opts?.n ?? DEFAULT_N)
  let count = 0
  const entries: ShadowEntry[] = []

  return {
    shouldSample(): boolean {
      const trigger = count % n === 0
      count++
      return trigger
    },

    record(entry: ShadowEntry): void {
      entries.push(entry)
    },

    meanBaseline(lever: ShadowEntry['lever']): number {
      const leverEntries = entries.filter((e) => e.lever === lever)
      if (leverEntries.length === 0) return 0
      const sum = leverEntries.reduce((s, e) => s + e.baselineTokens, 0)
      return sum / leverEntries.length
    },

    get samples(): readonly ShadowEntry[] {
      return entries
    },
  }
}
