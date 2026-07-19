/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * Tests for consumer-proof — the producer that fills node.metadata.consumerProof
 * (node_f7e5dbdbdf06, épico node_7deb314e81b0). Additive & immutable: recording
 * proof must never overwrite existing metadata fields (AC3). A failed proof is
 * still recorded with result=failed so the certainty composer can red-flag it.
 */

import { describe, it, expect } from 'vitest'
import { buildConsumerProof, mergeConsumerProof } from '../core/certainty/consumer-proof.js'

describe('buildConsumerProof', () => {
  it('records the command that ran, the result, and the timestamp', () => {
    const p = buildConsumerProof('agf certainty node_x', 'passed', 1700000000000)
    expect(p.command).toBe('agf certainty node_x')
    expect(p.result).toBe('passed')
    expect(p.ranAt).toBe(1700000000000)
  })

  it('preserves a failed result (a failed proof is still a recorded fact)', () => {
    const p = buildConsumerProof('agf x', 'failed', 1)
    expect(p.result).toBe('failed')
  })

  it('attaches optional evidence when provided', () => {
    const p = buildConsumerProof('agf x', 'passed', 1, 'rendered PROVEN band')
    expect(p.evidence).toBe('rendered PROVEN band')
  })
})

describe('mergeConsumerProof (additive, immutable)', () => {
  it('adds consumerProof without dropping existing metadata fields', () => {
    const existing = { origin: 'cli', inferred: false }
    const proof = buildConsumerProof('agf x', 'passed', 1)
    const merged = mergeConsumerProof(existing, proof)
    expect(merged.origin).toBe('cli')
    expect(merged.inferred).toBe(false)
    expect(merged.consumerProof).toEqual(proof)
  })

  it('does not mutate the input metadata object', () => {
    const existing = { origin: 'cli' }
    mergeConsumerProof(existing, buildConsumerProof('agf x', 'passed', 1))
    expect('consumerProof' in existing).toBe(false)
  })

  it('handles undefined metadata → returns object with only consumerProof', () => {
    const proof = buildConsumerProof('agf x', 'passed', 1)
    const merged = mergeConsumerProof(undefined, proof)
    expect(merged.consumerProof).toEqual(proof)
  })
})
