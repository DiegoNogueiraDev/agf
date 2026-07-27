/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * `saved` is a token count. One lever wrote a price into it.
 *
 * `agf montar-output` recorded one recovery twice. `rag_out_recovery` carried the structure it
 * saved — 159 tokens, counted from the rendered body. `scaffold_recovery` carried 239: the same
 * structure priced by `scaffoldCostBreakdown`, which charges output tokens at 2.0 and cache reads
 * at 0.5, so everything but 1.5× the structure cancels. 159 → 239. 212 → 318. 224 → 336.
 *
 * `agf savings` summed both. A recovery worth 159 tokens was reported as 398, in a unit that is
 * neither tokens nor cost. Four turns of work went into making that number name its baseline, own
 * its attribution, and refuse to exist without evidence — resting on an addition that did not add.
 *
 * WHY a denylist and not a list of the permitted: the column's contract is tokens, and twenty-one
 * of the twenty-two levers keep it. An allowlist was the first attempt here and it was wrong in a
 * way worth remembering: it silently zeroed `ncd_dedup`, `compress`, `stigmergy` and every other
 * lever nobody had thought to enumerate. The exception is what needs naming, not the rule.
 *
 * WHY the history stays: a ledger is not rewritten because its author was wrong. The rows remain
 * and `agf savings` lists them under their lever; the totals stop counting them.
 *
 * The cost model is real and it survives — in the `montar-output` envelope, where a reader can see
 * that 2.0 and 0.5 are assumptions about a provider's price list, not measurements of anything.
 */

/**
 * Levers whose `saved` is not a token count, and so may never enter a token total.
 *
 * `scaffold_recovery` recorded 1.5× the structure in relative cost units, for a recovery that
 * `rag_out_recovery` had already counted. Nothing writes it any more; its rows outlive it.
 */
export const NON_TOKEN_LEVERS: ReadonlySet<string> = new Set(['scaffold_recovery'])

/**
 * True unless the lever is a known exception. A new lever records tokens — that is the column —
 * and one that cannot must be named above, where somebody has to defend it.
 */
export function isTokenLever(lever: string): boolean {
  return !NON_TOKEN_LEVERS.has(lever)
}
