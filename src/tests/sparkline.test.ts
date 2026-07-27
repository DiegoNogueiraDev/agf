import { describe, it, expect } from 'vitest'
import { sparkline } from '../tui/widgets/sparkline.js'

describe('sparkline', () => {
  it('returns empty string for empty data', () => {
    expect(sparkline([])).toBe('')
  })

  it('returns a string of block characters for non-empty data', () => {
    const result = sparkline([1, 2, 3, 4, 5])
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('length matches data length by default', () => {
    const data = [10, 20, 30]
    const result = sparkline(data)
    expect(result.length).toBe(data.length)
  })

  it('respects custom width option', () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8]
    const result = sparkline(data, { width: 4 })
    expect(result.length).toBe(4)
  })

  it('uses block characters from ▁▂▃▄▅▆▇█', () => {
    const blocks = '▁▂▃▄▅▆▇█'
    const result = sparkline([1, 50, 100])
    for (const ch of result) {
      expect(blocks).toContain(ch)
    }
  })

  it('single data point renders one block', () => {
    const result = sparkline([42])
    expect(result.length).toBe(1)
  })

  it('uniform data renders same block for all positions', () => {
    const result = sparkline([5, 5, 5, 5])
    const chars = new Set(result)
    expect(chars.size).toBe(1)
  })

  it('ascending data uses increasingly tall blocks', () => {
    const result = sparkline([0, 25, 50, 75, 100])
    expect(result.length).toBe(5)
  })

  it('respects explicit min/max options', () => {
    const result = sparkline([50], { min: 0, max: 100 })
    expect(result.length).toBe(1)
    expect('▁▂▃▄▅▆▇█').toContain(result[0])
  })

  it('single point with width > 1 pads from the same value', () => {
    const result = sparkline([100], { width: 3 })
    expect(result.length).toBe(3)
  })
})
