/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * RAG-IN telemetry — counterfactual economy of recovering a command instead of
 * generating it via LLM.
 *
 * Honesty rule (PRD Part 4.4): economy = baseline − real, and every figure names the baseline it
 * was computed against. Two exist. `measured_fallback` counts the tokens `agf help` really emitted
 * on this machine — the path a successful retrieval avoided, and the one the engine hands back
 * when it refuses. `structural` is the old constant, kept for a machine that has never run help,
 * and it says so rather than passing for evidence. `baselineMethod` labels which, always.
 */

import type { LeverEvent } from '../economy/economy-lever-ledger.js'
import type { FallbackBaseline } from './fallback-baseline.js'
import type { RetrieveDecision, RetrieveOutcome } from './retrieve.js'

/**
 * `measured_fallback` is the only one of these grounded in something that happened: the tokens
 * `agf help` really emitted, counted in `command_invocations`. `structural` is the estimate used
 * when nothing has been measured yet — and it says so, rather than passing for evidence.
 */
export type BaselineMethod = 'structural' | 'measured_fallback' | 'measured_template' | 'shadow' | 'ab'

export interface RagInEconomy {
  lever: 'rag_in_reuse'
  decision: RetrieveOutcome
  /** Estimated tokens an LLM generation would have cost (the avoided cost). */
  baselineTokens: number
  /** Tokens actually consumed by retrieval output (the recovered command). */
  actualTokens: number
  /** baselineTokens − actualTokens (≥ 0). */
  saved: number
  /** How baselineTokens was derived — labeled, never mixed across methods. */
  baselineMethod: BaselineMethod
  /** How many `agf help` runs the measured baseline was taken over. Evidence has a sample size. */
  baselineSamples?: number
  /** The rerank/confidence score that drove the gate (for calibration). */
  rerankScore: number
}

/** Coarse token estimate (~4 chars/token), good enough for the structural baseline. */
function approxTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}

/**
 * Structural fallback for a machine that has never run `agf help`: had the agent generated the
 * command via LLM, it would have produced the command line plus a short explanation (~60 tokens of
 * reasoning/prose is typical). A guess, kept only until there is something to measure — see
 * fallback-baseline.ts for the number that replaces it.
 */
const GENERATION_OVERHEAD_TOKENS = 60

/**
 * Tokens the retrieval saved.
 *
 * With a measured baseline, the saving is the cost of the path the agent did not have to take:
 * reading `agf help`, which is what the engine hands back when it refuses. Without one, the old
 * constant stands and `baselineMethod` says `structural` so nobody mistakes it for evidence.
 */
export function estimateRagInEconomy(result: RetrieveDecision, fallback?: FallbackBaseline | null): RagInEconomy {
  if (result.decision !== 'retrieved' || !result.top) {
    return {
      lever: 'rag_in_reuse',
      decision: result.decision,
      baselineTokens: 0,
      actualTokens: 0,
      saved: 0,
      baselineMethod: 'structural',
      rerankScore: result.confidence,
    }
  }
  const commandTokens = approxTokens(result.top.command)
  const avoidedTokens = fallback ? fallback.tokens : GENERATION_OVERHEAD_TOKENS
  const baselineTokens = commandTokens + avoidedTokens

  return {
    lever: 'rag_in_reuse',
    decision: 'retrieved',
    baselineTokens,
    actualTokens: commandTokens,
    saved: avoidedTokens,
    baselineMethod: fallback ? 'measured_fallback' : 'structural',
    ...(fallback ? { baselineSamples: fallback.samples } : {}),
    rerankScore: result.confidence,
  }
}

/** Map an economy estimate to a ledger lever event. */
export function toLeverEvent(e: RagInEconomy, sessionId: string, nodeId?: string): LeverEvent {
  const accepted = e.decision === 'retrieved' && e.saved > 0
  return {
    sessionId,
    nodeId,
    lever: e.lever,
    tokensBefore: e.baselineTokens,
    tokensAfter: e.actualTokens,
    saved: e.saved,
    accepted,
    gateOutcome: accepted ? 'accepted' : 'passthrough',
    score: e.rerankScore,
    baselineMethod: e.baselineMethod,
  }
}
