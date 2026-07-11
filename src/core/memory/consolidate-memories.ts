/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Offline sleep-consolidation over the project memory store (opt-in `consolidation`
 * lever). Folds near-duplicate memories into a single representative the way SHY
 * (Tononi–Cirelli synaptic homeostasis) renormalises traces during sleep — keeping
 * the distinct ones, removing the redundant re-statements so prior-memory injection
 * carries fewer tokens.
 *
 * Pure orchestration over {@link readAllMemories} + {@link consolidateTraces}; the
 * caller (gc command) decides whether to `apply` the deletions.
 */

import { readAllMemories, deleteMemory } from './memory-reader.js'
import { consolidateTraces } from './sleep-consolidation.js'
import { estimateTokens } from '../autonomy/token-ledger.js'

export interface ConsolidateMemoriesOptions {
  /** Merge memories whose NCD is below this. Default 0.3 (near-duplicates). */
  mergeThreshold?: number
  /** When true, delete the redundant memory files; when false, only report. Default false. */
  apply?: boolean
}

export interface ConsolidateMemoriesResult {
  /** Total memories scanned. */
  total: number
  /** Number of near-duplicate merge events. */
  merged: number
  /** Names of the redundant memories folded away (deleted when `apply`). */
  removed: string[]
  /** Estimated tokens no longer re-injected by dropping the redundant memories. */
  savedTokens: number
  /** Whether the deletions were applied. */
  applied: boolean
}

/**
 * Consolidate the project's memory store: merge near-duplicates and drop the
 * redundant re-statements. Returns what was (or would be) removed and the token
 * saving. Non-destructive unless `apply` is true.
 */
export async function consolidateProjectMemories(
  basePath: string,
  opts: ConsolidateMemoriesOptions = {},
): Promise<ConsolidateMemoriesResult> {
  const apply = opts.apply ?? false
  const mems = await readAllMemories(basePath)
  if (mems.length === 0) {
    return { total: 0, merged: 0, removed: [], savedTokens: 0, applied: apply }
  }

  // salience=1 + downscale=1 + floor=0 ⇒ pure near-duplicate merge (no salience pruning).
  const traces = mems.map((m) => ({ key: m.name, salience: 1, content: m.content }))
  const result = consolidateTraces(traces, {
    downscale: 1,
    floor: 0,
    mergeThreshold: opts.mergeThreshold ?? 0.3,
  })

  const surviving = new Set(result.consolidated.map((t) => t.key))
  const removed: string[] = []
  let savedTokens = 0
  for (const m of mems) {
    if (!surviving.has(m.name)) {
      savedTokens += estimateTokens(m.content)
      removed.push(m.name)
      if (apply) await deleteMemory(basePath, m.name)
    }
  }

  return { total: mems.length, merged: result.merged, removed, savedTokens, applied: apply }
}
