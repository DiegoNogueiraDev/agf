/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-sentrux-adoption — Task 0.2: Gate baseline snapshot.
 *
 * Captures and compares quality-signal baselines stored in .sentrux/baseline.json.
 * Pass condition: quality_signal does not drop by >0.1 AND god_file_count does
 * not increase by more than 5 versus the saved baseline.
 *
 * Purely deterministic — no LLM, no exec calls.
 */

export interface GateBaseline {
  timestamp: number
  quality_signal: number
  coupling_score: number
  cycle_count: number
  god_file_count: number
  hotspot_count: number
  complex_fn_count: number
  max_depth: number
  total_import_edges: number
  cross_module_edges: number
}

export interface GateDelta {
  quality_signal: number
  god_file_count: number
  coupling_score: number
  cycle_count: number
}

export interface GateResult {
  status: 'pass' | 'fail'
  delta: GateDelta
  reasons?: string[]
}

const QUALITY_SIGNAL_DROP_THRESHOLD = 0.1
const GOD_FILE_COUNT_INCREASE_THRESHOLD = 5

export function runSentruxGate(baseline: GateBaseline, current: GateBaseline): GateResult {
  const delta: GateDelta = {
    quality_signal: current.quality_signal - baseline.quality_signal,
    god_file_count: current.god_file_count - baseline.god_file_count,
    coupling_score: current.coupling_score - baseline.coupling_score,
    cycle_count: current.cycle_count - baseline.cycle_count,
  }

  const reasons: string[] = []

  if (delta.quality_signal < -QUALITY_SIGNAL_DROP_THRESHOLD) {
    reasons.push(
      `quality_signal dropped by ${(-delta.quality_signal).toFixed(3)} (threshold: ${QUALITY_SIGNAL_DROP_THRESHOLD})`,
    )
  }

  if (delta.god_file_count > GOD_FILE_COUNT_INCREASE_THRESHOLD) {
    reasons.push(
      `god_file_count increased by ${delta.god_file_count} (threshold: ${GOD_FILE_COUNT_INCREASE_THRESHOLD})`,
    )
  }

  const status = reasons.length === 0 ? 'pass' : 'fail'
  return { status, delta, ...(reasons.length > 0 && { reasons }) }
}

export function saveGateBaseline(baseline: GateBaseline): string {
  return JSON.stringify(baseline, null, 2)
}
