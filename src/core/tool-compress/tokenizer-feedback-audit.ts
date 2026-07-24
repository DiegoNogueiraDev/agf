/*!
 * SPDX-License-Identifier: MIT
 * Copyright © 2024-2026 decolua and contributors (9router)
 * Copyright © 2026 Diego Lima Nogueira de Paula (TypeScript port and changes)
 *
 * Ported from 9router (https://github.com/decolua/9router), MIT, whose
 * open-sse/rtk module is itself a port of rtk (https://github.com/rtk-ai/rtk),
 * Apache-2.0, © Patrick Szymkowiak. This file stays under its original MIT
 * terms; agent-graph-flow as a whole is Apache-2.0. See THIRD-PARTY-NOTICES.md.
 *
 * Tokenizer-feedback audit — measures real token counts for compression
 * candidates and admits only those that provably reduce output tokens.
 *
 * WHY: speculative compression (e.g. a filter that pads output) inflates
 * token spend instead of reducing it. Auditing before admission ensures
 * every filter in the approved set earns its place.
 *
 * Reuses estimateTokens from token-estimator (provider count_tokens when
 * available; heuristic otherwise). Approved set is in-memory; callers
 * persist it as needed via createApprovedSet().
 */

import { estimateTokens } from '../context/token-estimator.js'

export interface CompressionCandidate {
  /** Stable identifier for this filter/candidate. */
  id: string
  /** Original text before compression. */
  before: string
  /** Compressed text after filter applied. */
  after: string
}

export interface AuditResult {
  id: string
  accepted: boolean
  tokensBefore: number
  tokensAfter: number
  saved: number
}

/**
 * An in-memory approved-filter set. Created once per session and passed to
 * auditCandidate so approved ids persist across calls within the session.
 */
export function createApprovedSet(): Set<string> {
  return new Set<string>()
}

/**
 * Audit a compression candidate: measure tokens before/after and admit only
 * when tokensAfter < tokensBefore. Updates `approved` in place on acceptance.
 */
export function auditCandidate(candidate: CompressionCandidate, approved: Set<string>): AuditResult {
  const tokensBefore = estimateTokens(candidate.before)
  const tokensAfter = estimateTokens(candidate.after)
  const saved = tokensBefore - tokensAfter
  const accepted = tokensAfter < tokensBefore

  if (accepted) {
    approved.add(candidate.id)
  }

  return { id: candidate.id, accepted, tokensBefore, tokensAfter, saved }
}
