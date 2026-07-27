import { describe, it, expect } from 'vitest'
import { buildOutput } from '../core/tool-compress/filters/buildOutput.js'

describe('buildOutput', () => {
  it('returns empty string for empty input', () => {
    expect(buildOutput('')).toBe('')
  })

  it('returns a string', () => {
    expect(typeof buildOutput('some output')).toBe('string')
  })

  it('includes npm error lines', () => {
    const input = 'npm ERR! code ENOTFOUND\nnpm ERR! network request failed'
    const result = buildOutput(input)
    expect(result).toContain('ERR!')
  })

  it('passes through summary lines', () => {
    const input = 'added 42 packages in 3s'
    const result = buildOutput(input)
    expect(typeof result).toBe('string')
  })

  it('handles multiline output', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n')
    expect(typeof buildOutput(lines)).toBe('string')
  })
})
