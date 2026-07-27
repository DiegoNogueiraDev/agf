import { describe, it, expect } from 'vitest'
import { dedupLog } from '../core/tool-compress/filters/dedupLog.js'

describe('dedupLog', () => {
  it('returns string for empty input', () => {
    expect(typeof dedupLog('')).toBe('string')
  })

  it('preserves unique lines unchanged', () => {
    const input = 'line A\nline B\nline C'
    const result = dedupLog(input)
    expect(result).toContain('line A')
    expect(result).toContain('line B')
    expect(result).toContain('line C')
  })

  it('collapses consecutive duplicates with summary note', () => {
    const input = 'line X\nline X\nline X\nline Y'
    const result = dedupLog(input)
    expect(result).toContain('... (2 duplicate lines)')
    expect(result).toContain('line X')
    expect(result).toContain('line Y')
  })

  it('keeps non-consecutive same lines', () => {
    const input = 'line A\nline B\nline A'
    const result = dedupLog(input)
    const count = result.split('\n').filter((l) => l === 'line A').length
    expect(count).toBe(2)
  })
})
