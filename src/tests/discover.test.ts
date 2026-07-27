import { describe, it, expect } from 'vitest'
import { discoverEnabled, signatureOf, formatDiscover, type DiscoverRecord } from '../core/tool-compress/discover.js'

describe('discoverEnabled', () => {
  it('returns false when AGF_COMPRESS_DISCOVER is not set', () => {
    expect(discoverEnabled({})).toBe(false)
  })

  it('returns false when AGF_COMPRESS_DISCOVER is undefined', () => {
    expect(discoverEnabled({ AGF_COMPRESS_DISCOVER: undefined })).toBe(false)
  })

  it('returns true when AGF_COMPRESS_DISCOVER is "1"', () => {
    expect(discoverEnabled({ AGF_COMPRESS_DISCOVER: '1' })).toBe(true)
  })

  it('returns false for any other value', () => {
    expect(discoverEnabled({ AGF_COMPRESS_DISCOVER: 'true' })).toBe(false)
    expect(discoverEnabled({ AGF_COMPRESS_DISCOVER: '0' })).toBe(false)
    expect(discoverEnabled({ AGF_COMPRESS_DISCOVER: '' })).toBe(false)
  })
})

describe('signatureOf', () => {
  it('returns empty string for empty input', () => {
    expect(signatureOf('')).toBe('')
  })

  it('extracts the first non-empty line', () => {
    const sig = signatureOf('first line\nsecond line\nthird line')
    expect(sig).toBe('first line')
  })

  it('skips leading blank lines', () => {
    const sig = signatureOf('\n\nactual content here')
    expect(sig).toBe('actual content here')
  })

  it('replaces hex hashes with #', () => {
    const sig = signatureOf('commit abc123def456 changed 3 files')
    expect(sig).toContain('#')
    expect(sig).not.toContain('abc123def456')
  })

  it('replaces numbers with #', () => {
    const sig = signatureOf('processed 42 items in 5 seconds')
    expect(sig).not.toContain('42')
    expect(sig).not.toContain('5')
    expect(sig).toContain('#')
  })

  it('truncates at 64 characters', () => {
    const longLine = 'word '.repeat(30)
    expect(signatureOf(longLine).length).toBeLessThanOrEqual(64)
  })

  it('collapses whitespace', () => {
    const sig = signatureOf('multiple   spaces   here')
    expect(sig).toBe('multiple spaces here')
  })
})

describe('formatDiscover', () => {
  it('returns no-records message for empty array', () => {
    const result = formatDiscover([])
    expect(result).toContain('nenhuma saída não-comprimida')
  })

  it('includes header and record info for non-empty records', () => {
    const records: DiscoverRecord[] = [{ sample: 'some output', bytes: 2048, count: 5 }]
    const result = formatDiscover(records)
    expect(result).toContain('compress discover')
    expect(result).toContain('2.0')
    expect(result).toContain('some output')
  })

  it('sorts and formats multiple records', () => {
    const records: DiscoverRecord[] = [
      { sample: 'first', bytes: 1024, count: 3 },
      { sample: 'second', bytes: 512, count: 7 },
    ]
    const result = formatDiscover(records)
    expect(result).toContain('first')
    expect(result).toContain('second')
  })

  it('includes call-to-action footer', () => {
    const result = formatDiscover([{ sample: 'x', bytes: 100, count: 1 }])
    expect(result).toContain('filtro')
  })
})
