/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_5ae1c84016b1 — tier-downgrade: the forget-gate complement to promotion.
 * When backing evidence is invalidated the node's epistemic tier reverts one
 * step (validated→cited, proven→validated) — the LSTM forget gate adaptively
 * resetting a stale cell so confidence never lingers without support.
 * Ported from graph-flow/core/provenance/tier-downgrade.ts.
 */
import { describe, it, expect } from 'vitest'
import {
  downgradeTier,
  canAdvanceToHandoff,
  InvalidDowngradeError,
  EmptyCauseError,
  DowngradeBlockedError,
} from '../core/provenance/tier-downgrade.js'

describe('downgradeTier — forget-gate over epistemic tiers (#node_5ae1c84016b1)', () => {
  it('downgrades validated → cited and emits a tier_downgraded audit event', () => {
    const r = downgradeTier({ nodeId: 'n', currentTier: 'validated', test_run_id: 'run_9', cause: 'test now failing' })
    expect(r.tier).toBe('cited')
    expect(r.event).toMatchObject({ type: 'tier_downgraded', from: 'validated', to: 'cited', test_run_id: 'run_9' })
    expect(r.event.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T/)
  })

  it('downgrades proven → validated', () => {
    expect(downgradeTier({ nodeId: 'n', currentTier: 'proven', test_run_id: 'r', cause: 'receipt revoked' }).tier).toBe(
      'validated',
    )
  })

  it('refuses to downgrade claim or cited (nothing below to fall to)', () => {
    expect(() => downgradeTier({ nodeId: 'n', currentTier: 'cited', test_run_id: 'r', cause: 'x' })).toThrow(
      InvalidDowngradeError,
    )
    expect(() => downgradeTier({ nodeId: 'n', currentTier: 'claim', test_run_id: 'r', cause: 'x' })).toThrow(
      InvalidDowngradeError,
    )
  })

  it('requires a non-empty cause', () => {
    expect(() => downgradeTier({ nodeId: 'n', currentTier: 'validated', test_run_id: 'r', cause: '   ' })).toThrow(
      EmptyCauseError,
    )
  })

  it('canAdvanceToHandoff blocks in strict mode during REVIEW when a downgrade occurred', () => {
    expect(() => canAdvanceToHandoff({ mode: 'strict', phase: 'REVIEW', hasDowngradeInCurrentPhase: true })).toThrow(
      DowngradeBlockedError,
    )
  })

  it('canAdvanceToHandoff is a no-op in advisory mode or without a downgrade', () => {
    expect(() =>
      canAdvanceToHandoff({ mode: 'advisory', phase: 'REVIEW', hasDowngradeInCurrentPhase: true }),
    ).not.toThrow()
    expect(() =>
      canAdvanceToHandoff({ mode: 'strict', phase: 'REVIEW', hasDowngradeInCurrentPhase: false }),
    ).not.toThrow()
  })
})
