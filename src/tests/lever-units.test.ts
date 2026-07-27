/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * One recovery, two rows, two units, one total.
 *
 * `agf montar-output` recorded `rag_out_recovery` with the structure it saved — 159 tokens,
 * counted from the rendered body — and then recorded `scaffold_recovery` with 239. The second
 * number is the first one priced: `scaffoldCostBreakdown` multiplies output tokens by 2.0 and
 * cache reads by 0.5, so `saved` comes out at exactly 1.5× the structure. 159 → 239. 212 → 318.
 * 224 → 336. Every time.
 *
 * Both rows landed in `saved`, and `agf savings` summed them. A recovery that saved 159 tokens was
 * reported as 398, in a unit that is neither tokens nor cost.
 *
 * The ledger's `saved` is tokens. The cost model is real and stays — in the envelope, where a
 * reader can see what it is — but it is not a second saving, and the same event does not get a
 * second row.
 */

import { describe, it, expect } from 'vitest'
import { scaffoldCostBreakdown } from '../core/rag-out/economy.js'
import { NON_TOKEN_LEVERS, isTokenLever } from '../core/economy/lever-units.js'

describe('scaffoldCostBreakdown — a price, not a token count', () => {
  // structure × 2.0 (output) + slots × 2.0, minus structure × 0.5 (cache) + slots × 2.0.
  // Everything but 1.5× the structure cancels.
  it.each([
    [159, 239],
    [212, 318],
    [224, 336],
  ])('prices %i structure tokens at %i cost units', (structureTokens, cost) => {
    const breakdown = scaffoldCostBreakdown({ structureTokens, slotTokens: 48 })
    expect(Math.round(breakdown.saved)).toBe(cost)
  })

  it('is independent of the slots, which are generated either way', () => {
    const few = scaffoldCostBreakdown({ structureTokens: 100, slotTokens: 12 })
    const many = scaffoldCostBreakdown({ structureTokens: 100, slotTokens: 480 })
    expect(few.saved).toBe(many.saved)
  })
})

describe('lever units — `saved` is tokens, and only tokens are summed', () => {
  it('names the one exception, and only it', () => {
    expect([...NON_TOKEN_LEVERS]).toEqual(['scaffold_recovery'])
  })

  // Historical rows survive: a ledger is not rewritten because its author was wrong. They are
  // excluded from the totals instead, and the exclusion is the thing under test.
  it('rejects the lever that recorded a price, and the same event twice', () => {
    expect(isTokenLever('scaffold_recovery')).toBe(false)
  })

  // An allowlist was the first attempt. It silently zeroed every lever nobody had enumerated —
  // `ncd_dedup`, `compress`, `stigmergy` — and the dashboard's economy endpoint went to zero with
  // them. The column's contract is tokens; the exception is what needs naming.
  it.each(['rag_in_reuse', 'rag_out_recovery', 'ncd_dedup', 'compress', 'stigmergy', 'scaffold-coupler'])(
    '%s records tokens, and is counted',
    (lever) => {
      expect(isTokenLever(lever)).toBe(true)
    },
  )

  it('counts a lever nobody has written yet — the column is tokens until someone says otherwise', () => {
    expect(isTokenLever('some_future_lever')).toBe(true)
  })
})
