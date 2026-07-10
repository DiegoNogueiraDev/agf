/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Tier Promotion — evidence-gated epistemic tier transitions.
 *
 * Tiers (ascending): claim → cited → validated → proven
 *
 * A knowledge node starts as a low-confidence `claim`. It is only promoted as
 * evidence accrues — the agentic analogue of the clipped, bounded cell
 * activations in Sak et al. 2014 (cells clamped to [-50,50] so the network
 * never runs away on unbounded confidence). Here the clamp is epistemic: a claim
 * cannot masquerade as proven without a receipt, so the loop never marks work
 * "done" on an unbacked assertion (the repo's honesty principle).
 *
 * Evidence required per target tier:
 *   cited     — citation_id that resolves (checked via resolveCitationId callback)
 *   validated — test_run_id (non-empty)
 *   proven    — provenance_receipt_id (non-empty, e.g. an OTS hash)
 *
 * Pure function — no I/O. Emits a `tier_promoted` event on success.
 * Ported from graph-flow/core/provenance/tier-promotion.ts.
 */

import { McpGraphError } from '../utils/errors.js'

// ── Types ──────────────────────────────────────────────────────────────────

export type EpistemicTier = 'claim' | 'cited' | 'validated' | 'proven'

export interface PromotionEvidence {
  readonly citation_id?: string
  readonly test_run_id?: string
  readonly provenance_receipt_id?: string
}

export interface PromotionInput {
  readonly nodeId: string
  readonly currentTier: EpistemicTier
  readonly targetTier: EpistemicTier
  readonly evidence: PromotionEvidence
  /** Optional resolver; defaults to always-true when omitted. */
  readonly resolveCitationId?: (id: string) => boolean
  /** Optional resolver checking that test_run_id is a real passing run (ledger-backed); defaults to always-true. */
  readonly resolveTestRunId?: (id: string) => boolean
}

export interface PromotionEvent {
  readonly type: 'tier_promoted'
  readonly nodeId: string
  readonly from: EpistemicTier
  readonly to: EpistemicTier
  readonly timestamp: string
}

export interface PromotionResult {
  readonly tier: EpistemicTier
  readonly events: readonly PromotionEvent[]
}

// ── Typed errors ───────────────────────────────────────────────────────────

export class MissingEvidenceError extends McpGraphError {
  constructor(artifact: string, targetTier: EpistemicTier) {
    super(`'${artifact}' is required to promote to tier '${targetTier}'`)
    this.name = 'MissingEvidenceError'
  }
}

export class InvalidCitationError extends McpGraphError {
  constructor(citationId: string) {
    super(`citation_id '${citationId}' could not be resolved`)
    this.name = 'InvalidCitationError'
  }
}

export class InvalidTestRunError extends McpGraphError {
  constructor(testRunId: string) {
    super(`test_run_id '${testRunId}' is not a real passing test run (no receipt in the ledger)`)
    this.name = 'InvalidTestRunError'
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Promote a node to a target epistemic tier, enforcing the evidence required
 * for that tier. Throws {@link MissingEvidenceError} / {@link InvalidCitationError}
 * when the gate is not satisfied. Returns the new tier plus a `tier_promoted`
 * event for the audit trail. */
export function promoteTier(input: PromotionInput): PromotionResult {
  const { nodeId, currentTier, targetTier, evidence, resolveCitationId, resolveTestRunId } = input

  validateEvidence(targetTier, evidence, resolveCitationId, resolveTestRunId)

  const event: PromotionEvent = {
    type: 'tier_promoted',
    nodeId,
    from: currentTier,
    to: targetTier,
    timestamp: new Date().toISOString(),
  }

  return { tier: targetTier, events: [event] }
}

// ── Private ────────────────────────────────────────────────────────────────

function validateEvidence(
  targetTier: EpistemicTier,
  evidence: PromotionEvidence,
  resolveCitationId?: (id: string) => boolean,
  resolveTestRunId?: (id: string) => boolean,
): void {
  if (targetTier === 'cited') {
    if (!evidence.citation_id) {
      throw new MissingEvidenceError('citation_id', 'cited')
    }
    const resolve = resolveCitationId ?? ((): boolean => true)
    if (!resolve(evidence.citation_id)) {
      throw new InvalidCitationError(evidence.citation_id)
    }
  }

  if (targetTier === 'validated') {
    if (!evidence.test_run_id) {
      throw new MissingEvidenceError('test_run_id', 'validated')
    }
    const resolve = resolveTestRunId ?? ((): boolean => true)
    if (!resolve(evidence.test_run_id)) {
      throw new InvalidTestRunError(evidence.test_run_id)
    }
  }

  if (targetTier === 'proven') {
    if (!evidence.provenance_receipt_id) {
      throw new MissingEvidenceError('provenance_receipt_id', 'proven')
    }
  }
}
