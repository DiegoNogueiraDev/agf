/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * Tests for the certainty gate (node_03aed600188a, épico node_7deb314e81b0).
 * `agf done --certainty` refuses a delivery whose HARD pillars are not all
 * green. The gate is opt-in: default OFF keeps `done` byte-identical.
 * The verdict must NAME the blocking pillars — a refusal with no reason is
 * as useless as a false green.
 */

import { describe, it, expect } from 'vitest'
import { evaluateCertaintyGate } from '../core/certainty/certainty-gate.js'
import type { DeliveryCertainty, CertaintyPillar } from '../core/certainty/delivery-certainty.js'

function pillar(key: CertaintyPillar['key'], state: CertaintyPillar['state']): CertaintyPillar {
  return { key, kind: 'hard', state, source: 's', detail: 'd', rationale: 'r' }
}

function certainty(over: Partial<DeliveryCertainty> = {}): DeliveryCertainty {
  return {
    nodeId: 'n1',
    confidence: 100,
    band: 'PROVEN',
    pillars: [pillar('code_on_disk', 'green')],
    blockingPillars: [],
    ...over,
  }
}

describe('evaluateCertaintyGate', () => {
  it('PROVEN → not blocked (done proceeds)', () => {
    const v = evaluateCertaintyGate(certainty())
    expect(v.blocked).toBe(false)
    expect(v.blockingPillars).toEqual([])
  })

  it('PROVEN_INCOMPLETE with consumer_proof red → blocked and names consumer_proof', () => {
    const v = evaluateCertaintyGate(
      certainty({
        band: 'PROVEN_INCOMPLETE',
        confidence: 38,
        blockingPillars: ['consumer_proof'],
        pillars: [pillar('consumer_proof', 'red')],
      }),
    )
    expect(v.blocked).toBe(true)
    expect(v.blockingPillars).toContain('consumer_proof')
    expect(v.reason).toContain('consumer_proof')
  })

  it('UNKNOWN → blocked (absence of data is never proof)', () => {
    const v = evaluateCertaintyGate(certainty({ band: 'UNKNOWN', confidence: 0, blockingPillars: [] }))
    expect(v.blocked).toBe(true)
    expect(v.reason.length).toBeGreaterThan(0)
  })

  it('multiple red hard pillars are all named in the reason', () => {
    const v = evaluateCertaintyGate(
      certainty({
        band: 'PROVEN_INCOMPLETE',
        blockingPillars: ['consumer_proof', 'test_on_disk'],
      }),
    )
    expect(v.reason).toContain('consumer_proof')
    expect(v.reason).toContain('test_on_disk')
  })

  it('carries the band and confidence through for the caller envelope', () => {
    const v = evaluateCertaintyGate(certainty({ band: 'PROVEN_INCOMPLETE', confidence: 38 }))
    expect(v.band).toBe('PROVEN_INCOMPLETE')
    expect(v.confidence).toBe(38)
  })
})
