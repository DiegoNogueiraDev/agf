/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Tier Downgrade — automatic reversal when backing evidence is invalidated.
 *
 * The forget-gate complement to tier-promotion: when a cell's support fails, the
 * LSTM forget gate adaptively resets it so stale state does not linger. Here,
 * when a node's evidence is invalidated its epistemic tier reverts one step:
 *   validated → cited   when its test_run becomes failing
 *   proven    → validated when its provenance receipt is revoked
 *
 * Emits a `tier_downgraded` event with a full before/after/cause audit trail.
 * In strict mode during REVIEW, any downgrade blocks advancement to HANDOFF.
 * Pure function — no I/O. Ported from graph-flow/core/provenance/tier-downgrade.ts.
 */

import { McpGraphError } from '../utils/errors.js'
import type { EpistemicTier } from './tier-promotion.js'

// ── Types ──────────────────────────────────────────────────────────────────

export interface DowngradeInput {
  readonly nodeId: string
  /** Current tier — must be validated or proven (cannot downgrade claim/cited). */
  readonly currentTier: EpistemicTier
  /** The test run whose failure triggered this downgrade. */
  readonly test_run_id: string
  /** Human-readable reason for the downgrade — required, must be non-empty. */
  readonly cause: string
}

export interface DowngradeEvent {
  readonly type: 'tier_downgraded'
  readonly nodeId: string
  readonly from: EpistemicTier
  readonly to: EpistemicTier
  readonly test_run_id: string
  readonly cause: string
  readonly timestamp: string
}

export interface DowngradeResult {
  readonly tier: EpistemicTier
  readonly event: DowngradeEvent
}

export interface HandoffGateInput {
  readonly mode: 'strict' | 'advisory'
  readonly phase: string
  readonly hasDowngradeInCurrentPhase: boolean
}

// ── Typed errors ───────────────────────────────────────────────────────────

export class InvalidDowngradeError extends McpGraphError {
  constructor(currentTier: EpistemicTier) {
    super(`Cannot downgrade from tier '${currentTier}' — only 'validated' and 'proven' nodes can be downgraded`)
    this.name = 'InvalidDowngradeError'
  }
}

export class EmptyCauseError extends McpGraphError {
  constructor() {
    super('Downgrade cause must be a non-empty string — provide a description of the failure')
    this.name = 'EmptyCauseError'
  }
}

export class DowngradeBlockedError extends McpGraphError {
  constructor() {
    super(
      'HANDOFF blocked: a tier downgrade occurred during REVIEW phase (strict mode). ' +
        'Resolve the invalidated evidence before advancing to HANDOFF.',
    )
    this.name = 'DowngradeBlockedError'
  }
}

// ── Downgrade target map ────────────────────────────────────────────────────

const DOWNGRADE_TARGET: Partial<Record<EpistemicTier, EpistemicTier>> = {
  validated: 'cited',
  proven: 'validated',
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Revert a node's epistemic tier by one step when its backing evidence fails.
 * Returns the new tier and a full audit event. */
export function downgradeTier(input: DowngradeInput): DowngradeResult {
  const { nodeId, currentTier, test_run_id, cause } = input

  if (!cause || cause.trim().length === 0) {
    throw new EmptyCauseError()
  }

  const targetTier = DOWNGRADE_TARGET[currentTier]
  if (targetTier === undefined) {
    throw new InvalidDowngradeError(currentTier)
  }

  const event: DowngradeEvent = {
    type: 'tier_downgraded',
    nodeId,
    from: currentTier,
    to: targetTier,
    test_run_id,
    cause,
    timestamp: new Date().toISOString(),
  }

  return { tier: targetTier, event }
}

/** Gate check before advancing to HANDOFF. In strict mode, a downgrade during
 * the REVIEW phase is a hard blocker. */
export function canAdvanceToHandoff(input: HandoffGateInput): void {
  if (input.mode === 'strict' && input.phase === 'REVIEW' && input.hasDowngradeInCurrentPhase) {
    throw new DowngradeBlockedError()
  }
}
