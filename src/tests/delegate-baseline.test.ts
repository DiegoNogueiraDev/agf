/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * `agf metrics` printed: "CLI economy: 7458030432 tok economizados (99%)".
 *
 * Seven and a half billion tokens. The baseline behind it was `graph_export_bytes / 4 × calls` —
 * the size of the entire graph, asserted as what each of 17,472 CLI invocations replaced. Nobody
 * dumps the whole graph seventeen thousand times. The counterfactual was never true, so neither
 * was the saving, and an unfalsifiable number does more damage than none: it discredits the 6,991
 * tokens the lever ledger measured against a baseline you can argue with.
 *
 * A number that cannot be wrong cannot be evidence. So every economy figure names the baseline it
 * was computed against, and the word "saved" is reserved for the ones that measured something.
 */

import { describe, it, expect } from 'vitest'
import {
  DELEGATE_BASELINE_METHOD,
  describeDelegateEconomy,
  boundDelegateBaseline,
} from '../core/economy/delegate-baseline.js'
import type { DelegateEconomy } from '../core/economy/savings-tracker.js'

const economy: DelegateEconomy = {
  cmdCalls: 17472,
  cmdTok: 49035781,
  baselineTok: 7508318705,
  baselineBytes: 30033274820,
  delegateSaved: 7459282924,
  savedPct: 99,
  avgTokPerCmd: 2806,
  baselineMethod: DELEGATE_BASELINE_METHOD,
}

describe('delegate economy — a number that names its counterfactual', () => {
  it('carries the baseline it was computed against', () => {
    expect(economy.baselineMethod).toBe('full_graph_dump')
  })

  it('states the counterfactual instead of asserting a saving', () => {
    const line = describeDelegateEconomy(economy)

    // The old line said "7458030432 tok economizados (99%)" and stopped there.
    expect(line).toContain('full_graph_dump')
    expect(line).not.toMatch(/economizados/)
  })

  it('reports what was actually measured: calls and the tokens agf really emitted', () => {
    const line = describeDelegateEconomy(economy)
    expect(line).toContain('17472')
    expect(line).toContain('49035781')
  })

  it('never divides by zero when nothing has been measured yet', () => {
    const empty: DelegateEconomy = { ...economy, cmdCalls: 0, cmdTok: 0, baselineTok: 0, delegateSaved: 0, savedPct: 0 }
    expect(() => describeDelegateEconomy(empty)).not.toThrow()
  })
})

describe('boundDelegateBaseline', () => {
  it('caps the raw Σ(full graph × every call) at one full read per active day', () => {
    // 18k calls each recording a ~1.7MB graph → 30GB raw. The agent does NOT reload the
    // graph on every call: bound it at (one full read) × (active days).
    const rawBytes = 30_000_000_000
    const perReadBytes = 1_700_000
    const episodes = 24
    const { baselineBytes, bounded } = boundDelegateBaseline({ rawBytes, perReadBytes, episodes })
    expect(bounded).toBe(true)
    expect(baselineBytes).toBe(perReadBytes * episodes) // 40.8MB, not 30GB
    expect(baselineBytes).toBeLessThan(rawBytes)
  })

  it('leaves the raw figure untouched when it is already below the bound', () => {
    const { baselineBytes, bounded } = boundDelegateBaseline({
      rawBytes: 500_000,
      perReadBytes: 1_000_000,
      episodes: 3,
    })
    expect(bounded).toBe(false)
    expect(baselineBytes).toBe(500_000)
  })

  it('floors episodes at 1 so a single-day project still gets one full read', () => {
    const { baselineBytes } = boundDelegateBaseline({ rawBytes: 10_000_000, perReadBytes: 1_000_000, episodes: 0 })
    expect(baselineBytes).toBe(1_000_000)
  })

  it('never returns a negative or NaN baseline', () => {
    const { baselineBytes, bounded } = boundDelegateBaseline({ rawBytes: 0, perReadBytes: 0, episodes: 0 })
    expect(baselineBytes).toBe(0)
    expect(bounded).toBe(false)
    expect(Number.isFinite(baselineBytes)).toBe(true)
  })
})
