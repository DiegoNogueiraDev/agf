import { describe, it, expect } from 'vitest'
import { descriptionLength, selectByMDL } from '../core/economy/mdl-selector.js'
import type { CompressionOption } from '../core/economy/mdl-selector.js'

describe('descriptionLength', () => {
  it('sums modelBytes + residualBytes', () => {
    const opt: CompressionOption = { id: 'a', modelBytes: 10, residualBytes: 20 }
    expect(descriptionLength(opt)).toBe(30)
  })

  it('includes retrieval penalty when present', () => {
    const opt: CompressionOption = { id: 'a', modelBytes: 10, residualBytes: 20, retrievalPenaltyBytes: 5 }
    expect(descriptionLength(opt)).toBe(35)
  })

  it('defaults retrieval penalty to 0', () => {
    const opt: CompressionOption = { id: 'a', modelBytes: 0, residualBytes: 100 }
    expect(descriptionLength(opt)).toBe(100)
  })
})

describe('selectByMDL', () => {
  it('returns null chosen for empty input', () => {
    const result = selectByMDL([])
    expect(result.chosen).toBeNull()
    expect(result.lengths).toHaveLength(0)
  })

  it('selects the option with smallest total description length', () => {
    const options: CompressionOption[] = [
      { id: 'expensive', modelBytes: 50, residualBytes: 100 },
      { id: 'cheap', modelBytes: 5, residualBytes: 20 },
    ]
    const { chosen } = selectByMDL(options)
    expect(chosen?.id).toBe('cheap')
  })

  it('returns lengths in input order', () => {
    const options: CompressionOption[] = [
      { id: 'a', modelBytes: 10, residualBytes: 10 },
      { id: 'b', modelBytes: 5, residualBytes: 5 },
    ]
    const { lengths } = selectByMDL(options)
    expect(lengths[0].id).toBe('a')
    expect(lengths[1].id).toBe('b')
  })

  it('resolves ties to the earliest option', () => {
    const options: CompressionOption[] = [
      { id: 'first', modelBytes: 0, residualBytes: 50 },
      { id: 'second', modelBytes: 0, residualBytes: 50 },
    ]
    const { chosen } = selectByMDL(options)
    expect(chosen?.id).toBe('first')
  })
})
