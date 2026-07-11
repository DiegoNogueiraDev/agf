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
import { DELEGATE_BASELINE_METHOD, describeDelegateEconomy } from '../core/economy/delegate-baseline.js'
import type { DelegateEconomy } from '../core/economy/savings-tracker.js'

const economy: DelegateEconomy = {
  cmdCalls: 17472,
  cmdTok: 49035781,
  baselineTok: 7508318705,
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
