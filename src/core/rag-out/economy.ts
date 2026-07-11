/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * RAG-OUT telemetry — counterfactual economy of recovering a scaffold and
 * filling only its slots, instead of generating the whole structure via LLM.
 *
 * PRD 2.3: in structured artifacts the structure is 60-80% of the text, and it
 * is exactly the slice that leaves the expensive (`out = 2×`) generation when a
 * scaffold is recovered. Baseline method is **structural** (estimated, labeled),
 * never mixed with a measured shadow run (PRD 4.4).
 */

import type { LeverEvent } from '../economy/economy-lever-ledger.js'
import type { RagOutDecision } from './gate.js'
import type { BaselineMethod } from '../rag-in/economy.js'
import { structuralBaselineEstimate } from './structural-baseline.js'

export interface RagOutEconomy {
  lever: 'rag_out_recovery'
  decision: RagOutDecision['decision']
  /** Tokens an LLM would have generated (structure + slot content). */
  baselineTokens: number
  /** Tokens actually generated after recovery (slot content only). */
  actualTokens: number
  saved: number
  baselineMethod: BaselineMethod
  /** Fit score that drove the gate (for calibration). */
  fitScore: number
}

/**
 * Tokens the recovery saved.
 *
 * `structureTokens` is the body the scaffold hands over, counted — the boilerplate the model did
 * not have to write. Without it the old slot-count estimate stands, labelled `structural`, because
 * a number derived from how many holes a template has is not a measurement of the template.
 */
export function estimateRagOutEconomy(d: RagOutDecision, structureTokens?: number | null): RagOutEconomy {
  if (d.decision !== 'recover' || !d.best) {
    return {
      lever: 'rag_out_recovery',
      decision: d.decision,
      baselineTokens: 0,
      actualTokens: 0,
      saved: 0,
      baselineMethod: 'structural',
      fitScore: d.confidence,
    }
  }
  // Measured: the rendered body is the structure, and counting it beats inferring it from the
  // number of slots. Falls back to the slot-count estimate when no body could be produced —
  // though the gate now refuses to recover in that case, so it should not happen.
  if (structureTokens && structureTokens > 0) {
    const slotTokens = structuralBaselineEstimate(d.best).actualTokens
    return {
      lever: 'rag_out_recovery',
      decision: 'recover',
      baselineTokens: structureTokens + slotTokens,
      actualTokens: slotTokens,
      saved: structureTokens,
      baselineMethod: 'measured_template',
      fitScore: d.confidence,
    }
  }

  // Structure grows with slot count (structuralBaselineEstimate, PRD 4.4 method 2)
  // instead of a flat per-scaffold constant — a scaffold with more slots also
  // has more boilerplate structure around them.
  const baseline = structuralBaselineEstimate(d.best)
  return {
    lever: 'rag_out_recovery',
    decision: 'recover',
    baselineTokens: baseline.baselineTokens,
    actualTokens: baseline.actualTokens,
    saved: baseline.saved,
    baselineMethod: 'structural',
    fitScore: d.confidence,
  }
}

/** Relative price multipliers (normalized to input = 1.0). */
const OUTPUT_MULTIPLIER = 2.0 // output tokens cost 2× input for most providers
const CACHE_MULTIPLIER = 0.5 // cached-read tokens cost 0.5× input (PRD 2.3)

export interface ScaffoldCostBreakdown {
  /** Total cost if LLM generates everything (structure + slots) at output price. */
  baselineCost: number
  /** Cost when scaffold is recovered: structure at cache price + slots at output price. */
  recoveredCost: number
  saved: number
  /** savingsRatio = saved / baselineCost; 0 when baselineCost = 0. */
  savingsRatio: number
}

/**
 * Models the cache-pricing economy of scaffold recovery (PRD 2.3).
 *
 * Without scaffold: the LLM emits structure + slot content at `output` price
 * (2× input). With scaffold: structure is a cache-read (0.5× input); only
 * slots are generated. For 60-80% structure artifacts this yields >50% savings.
 */
export function scaffoldCostBreakdown(opts: { structureTokens: number; slotTokens: number }): ScaffoldCostBreakdown {
  const { structureTokens, slotTokens } = opts
  const baselineCost = (structureTokens + slotTokens) * OUTPUT_MULTIPLIER
  const recoveredCost = structureTokens * CACHE_MULTIPLIER + slotTokens * OUTPUT_MULTIPLIER
  const saved = baselineCost - recoveredCost
  const savingsRatio = baselineCost === 0 ? 0 : saved / baselineCost
  return { baselineCost, recoveredCost, saved, savingsRatio }
}

/**
 * Convert a ScaffoldCostBreakdown to a LeverEvent for the economy_lever_ledger.
 * Records actual cost savings (structure recovered at cache price vs output price).
 * saved=0 → passthrough (no recovery happened); saved>0 → accepted.
 */
export function toLeverEventFromBreakdown(b: ScaffoldCostBreakdown, sessionId: string, nodeId?: string): LeverEvent {
  const accepted = b.saved > 0
  return {
    sessionId,
    nodeId,
    lever: 'scaffold_recovery',
    tokensBefore: Math.round(b.baselineCost),
    tokensAfter: Math.round(b.recoveredCost),
    saved: Math.round(b.saved),
    accepted,
    gateOutcome: accepted ? 'accepted' : 'passthrough',
  }
}

export function toLeverEvent(e: RagOutEconomy, sessionId: string, nodeId?: string): LeverEvent {
  const accepted = e.decision === 'recover' && e.saved > 0
  return {
    sessionId,
    nodeId,
    lever: e.lever,
    tokensBefore: e.baselineTokens,
    tokensAfter: e.actualTokens,
    saved: e.saved,
    accepted,
    gateOutcome: accepted ? 'accepted' : 'passthrough',
    score: e.fitScore,
    baselineMethod: e.baselineMethod,
  }
}

/**
 * The scaffold_recovery lever is already recorded in economy_lever_ledger
 * (recordEconomy, montar-output-cmd.ts) but the operator never SAW the
 * savings on the proof surface — this makes the link between the chosen
 * scaffold and the recorded economy explicit in the command's own output.
 * Returns undefined (nothing to say) when no recovery actually happened.
 */
export function formatScaffoldRecoveryMessage(decision: 'recover' | 'generate', saved: number): string | undefined {
  if (decision !== 'recover' || saved <= 0) return undefined
  return `scaffold recovered: ${saved} tok saved`
}
