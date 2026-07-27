/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { QuorumGate } from '../core/swarm/quorum-gate.js'

describe('QuorumGate (bacterial quorum sensing for swarm broadcast)', () => {
  it('stays local below the quorum threshold', () => {
    const g = new QuorumGate({ quorum: 3 })
    expect(g.accumulate('finding-x')).toBe(false)
    expect(g.accumulate('finding-x')).toBe(false)
    expect(g.pending('finding-x')).toBe(2)
  })

  it('fires a broadcast once the quorum of correlated findings is reached', () => {
    const g = new QuorumGate({ quorum: 3 })
    g.accumulate('x')
    g.accumulate('x')
    expect(g.accumulate('x')).toBe(true) // 3rd reaches quorum
  })

  it('resets a topic after it fires', () => {
    const g = new QuorumGate({ quorum: 2 })
    g.accumulate('x')
    expect(g.accumulate('x')).toBe(true)
    expect(g.pending('x')).toBe(0)
    expect(g.accumulate('x')).toBe(false) // accumulating again from zero
  })

  it('supports weighted findings (strong correlations reach quorum faster)', () => {
    const g = new QuorumGate({ quorum: 5 })
    expect(g.accumulate('x', 3)).toBe(false)
    expect(g.accumulate('x', 2)).toBe(true) // 3 + 2 = 5
  })

  it('tracks independent topics separately', () => {
    const g = new QuorumGate({ quorum: 2 })
    g.accumulate('a')
    expect(g.accumulate('b')).toBe(false) // b is independent of a
    expect(g.pending('a')).toBe(1)
    expect(g.pending('b')).toBe(1)
  })

  it('reset() clears pending accumulation', () => {
    const g = new QuorumGate({ quorum: 3 })
    g.accumulate('x')
    g.reset('x')
    expect(g.pending('x')).toBe(0)
  })

  it('rejects a non-positive quorum', () => {
    expect(() => new QuorumGate({ quorum: 0 })).toThrow()
  })
})
