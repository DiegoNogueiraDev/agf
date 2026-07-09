/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * RAG-IN telemetry — counterfactual economy of recovering a command instead of
 * generating it via LLM.
 *
 * Honesty rule (PRD Part 4.4): economy = baseline − real, and the baseline here
 * is the **structural** method — we estimate what the LLM *would* have generated
 * (the command plus a short explanation), not a measured shadow run. The
 * `baselineMethod` field labels this so it is never mixed with a measured number.
 */

import type { LeverEvent } from '../economy/economy-lever-ledger.js'
import type { RetrieveDecision, RetrieveOutcome } from './retrieve.js'

export type BaselineMethod = 'structural' | 'shadow' | 'ab'

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
  /** The rerank/confidence score that drove the gate (for calibration). */
  rerankScore: number
}

/** Coarse token estimate (~4 chars/token), good enough for the structural baseline. */
function approxTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}

/**
 * Structural baseline: had the agent generated the command via LLM, it would
 * have produced the command line plus a short explanation (~60 tokens of
 * reasoning/prose is typical). Retrieval instead returns just the command from
 * the index. The delta is the saving.
 */
const GENERATION_OVERHEAD_TOKENS = 60

export function estimateRagInEconomy(result: RetrieveDecision): RagInEconomy {
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
  const baselineTokens = commandTokens + GENERATION_OVERHEAD_TOKENS
  const actualTokens = commandTokens
  return {
    lever: 'rag_in_reuse',
    decision: 'retrieved',
    baselineTokens,
    actualTokens,
    saved: baselineTokens - actualTokens,
    baselineMethod: 'structural',
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
  }
}
