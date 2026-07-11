/*!
 * TDD: recall filters by validity (node_208bf7f27a13).
 *
 * AC1: memories with valid_until < now are excluded from recall.
 * AC2: memories with valid_until=null or future valid_until are included.
 */

import { describe, it, expect } from 'vitest'
import { selectByActivation, type ScoredMemory } from '../core/memory/memory-salience.js'

const BASE_ACTIVATION = 1.0

function makeScoredMemory(name: string, validUntil: string | null | undefined): ScoredMemory {
  return {
    result: { name, snippet: `snippet of ${name}`, score: BASE_ACTIVATION, validUntil },
    activation: BASE_ACTIVATION,
    tokens: 10,
  }
}

const PAST = new Date(Date.now() - 60_000).toISOString() // 1 min ago
const FUTURE = new Date(Date.now() + 60_000).toISOString() // 1 min from now

describe('AC1: expired memories (valid_until < now) are excluded', () => {
  it('drops a memory whose valid_until is in the past', () => {
    const scored = [makeScoredMemory('expired-mem', PAST)]
    const { kept } = selectByActivation(scored, { limit: 10 })
    expect(kept.find((m) => m.name === 'expired-mem')).toBeUndefined()
  })

  it('drops expired while keeping valid ones', () => {
    const scored = [
      makeScoredMemory('expired-mem', PAST),
      makeScoredMemory('valid-mem', FUTURE),
      makeScoredMemory('no-expiry-mem', null),
    ]
    const { kept } = selectByActivation(scored, { limit: 10 })
    expect(kept.find((m) => m.name === 'expired-mem')).toBeUndefined()
    expect(kept.find((m) => m.name === 'valid-mem')).toBeDefined()
    expect(kept.find((m) => m.name === 'no-expiry-mem')).toBeDefined()
  })
})

describe('AC2: valid memories (null or future valid_until) are included', () => {
  it('includes memory with valid_until=null', () => {
    const scored = [makeScoredMemory('no-expiry', null)]
    const { kept } = selectByActivation(scored, { limit: 10 })
    expect(kept.find((m) => m.name === 'no-expiry')).toBeDefined()
  })

  it('includes memory with valid_until=undefined', () => {
    const scored = [makeScoredMemory('no-field', undefined)]
    const { kept } = selectByActivation(scored, { limit: 10 })
    expect(kept.find((m) => m.name === 'no-field')).toBeDefined()
  })

  it('includes memory with future valid_until', () => {
    const scored = [makeScoredMemory('future-valid', FUTURE)]
    const { kept } = selectByActivation(scored, { limit: 10 })
    expect(kept.find((m) => m.name === 'future-valid')).toBeDefined()
  })
})
