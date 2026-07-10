/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_82d06a62b317 — epistemic-tier ladder: claim→cited→validated→proven,
 * each transition gated by evidence. The LSTM-paper analogue of clipped, bounded
 * cell activations: a claim is a low-confidence value that only evidence promotes.
 * Ported from graph-flow/core/provenance/tier-promotion.ts.
 */
import { describe, it, expect } from 'vitest'
import {
  promoteTier,
  MissingEvidenceError,
  InvalidCitationError,
  InvalidTestRunError,
  type EpistemicTier,
} from '../core/provenance/tier-promotion.js'

describe('promoteTier — evidence-gated epistemic ladder (#node_82d06a62b317)', () => {
  it('promotes to "cited" with a resolvable citation_id and emits a tier_promoted event', () => {
    const result = promoteTier({
      nodeId: 'node_a',
      currentTier: 'claim',
      targetTier: 'cited',
      evidence: { citation_id: 'cit_1' },
      resolveCitationId: () => true,
    })
    expect(result.tier).toBe('cited')
    expect(result.events).toHaveLength(1)
    expect(result.events[0]).toMatchObject({ type: 'tier_promoted', nodeId: 'node_a', from: 'claim', to: 'cited' })
    expect(result.events[0]?.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T/)
  })

  it('defaults resolveCitationId to always-true when omitted', () => {
    const result = promoteTier({
      nodeId: 'node_a',
      currentTier: 'claim',
      targetTier: 'cited',
      evidence: { citation_id: 'cit_1' },
    })
    expect(result.tier).toBe('cited')
  })

  it('throws MissingEvidenceError when citation_id is absent for "cited"', () => {
    expect(() => promoteTier({ nodeId: 'n', currentTier: 'claim', targetTier: 'cited', evidence: {} })).toThrow(
      MissingEvidenceError,
    )
  })

  it('throws InvalidCitationError when the citation cannot be resolved', () => {
    expect(() =>
      promoteTier({
        nodeId: 'n',
        currentTier: 'claim',
        targetTier: 'cited',
        evidence: { citation_id: 'ghost' },
        resolveCitationId: () => false,
      }),
    ).toThrow(InvalidCitationError)
  })

  it('promotes to "validated" only with a test_run_id', () => {
    expect(
      promoteTier({ nodeId: 'n', currentTier: 'cited', targetTier: 'validated', evidence: { test_run_id: 'run_1' } })
        .tier,
    ).toBe('validated')
    expect(() => promoteTier({ nodeId: 'n', currentTier: 'cited', targetTier: 'validated', evidence: {} })).toThrow(
      MissingEvidenceError,
    )
  })

  it('rejects "validated" when the test_run_id does not resolve to a real run (teeth)', () => {
    expect(() =>
      promoteTier({
        nodeId: 'n',
        currentTier: 'cited',
        targetTier: 'validated',
        evidence: { test_run_id: 'fabricated' },
        resolveTestRunId: () => false,
      }),
    ).toThrow(InvalidTestRunError)
  })

  it('promotes to "validated" when the test_run_id resolves against the ledger', () => {
    expect(
      promoteTier({
        nodeId: 'n',
        currentTier: 'cited',
        targetTier: 'validated',
        evidence: { test_run_id: 'real_receipt' },
        resolveTestRunId: (id) => id === 'real_receipt',
      }).tier,
    ).toBe('validated')
  })

  it('promotes to "proven" only with a provenance_receipt_id', () => {
    expect(
      promoteTier({
        nodeId: 'n',
        currentTier: 'validated',
        targetTier: 'proven',
        evidence: { provenance_receipt_id: 'ots_hash' },
      }).tier,
    ).toBe('proven')
    expect(() => promoteTier({ nodeId: 'n', currentTier: 'validated', targetTier: 'proven', evidence: {} })).toThrow(
      MissingEvidenceError,
    )
  })

  it('treats "claim" as the evidence-free base tier (no gate)', () => {
    const tiers: EpistemicTier[] = ['claim', 'cited', 'validated', 'proven']
    expect(tiers[0]).toBe('claim')
    expect(promoteTier({ nodeId: 'n', currentTier: 'claim', targetTier: 'claim', evidence: {} }).tier).toBe('claim')
  })
})
