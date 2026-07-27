import { describe, it, expect } from 'vitest'
import { formatStatusLine } from '../tui/status-line.js'

describe('formatStatusLine', () => {
  it('includes token count', () => {
    const result = formatStatusLine({ totalTokens: 1240, costUsd: 0.003, model: 'claude-sonnet' })
    expect(result).toContain('1240 tok')
  })

  it('includes cost formatted to 4 decimal places', () => {
    const result = formatStatusLine({ totalTokens: 0, costUsd: 0.003, model: 'test-model' })
    expect(result).toContain('$0.0030')
  })

  it('includes model name', () => {
    const result = formatStatusLine({ totalTokens: 100, costUsd: 0.0, model: 'claude-opus' })
    expect(result).toContain('claude-opus')
  })

  it('rounds tokens to nearest integer', () => {
    const result = formatStatusLine({ totalTokens: 1239.7, costUsd: 0, model: 'auto' })
    expect(result).toContain('1240 tok')
  })

  it('returns 0 tok for negative tokens', () => {
    const result = formatStatusLine({ totalTokens: -5, costUsd: 0, model: 'auto' })
    expect(result).toContain('0 tok')
  })

  it('includes the decorative ⛁ prefix', () => {
    const result = formatStatusLine({ totalTokens: 0, costUsd: 0, model: 'auto' })
    expect(result).toContain('⛁')
  })

  it('returns a string', () => {
    const result = formatStatusLine({ totalTokens: 500, costUsd: 0.01, model: 'model-x' })
    expect(typeof result).toBe('string')
  })

  it('separates fields with ·', () => {
    const result = formatStatusLine({ totalTokens: 100, costUsd: 0.001, model: 'auto' })
    expect(result.split('·').length).toBe(3)
  })
})
