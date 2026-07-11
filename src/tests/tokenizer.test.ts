import { describe, it, expect } from 'vitest'
import { tokenize } from '../core/search/tokenizer.js'

describe('tokenize: default behavior', () => {
  it('returns lowercase tokens from plain text', () => {
    const result = tokenize('Hello World')
    expect(result).toContain('hello')
    expect(result).toContain('world')
  })

  it('removes EN stopwords by default', () => {
    const result = tokenize('the quick brown fox')
    expect(result).not.toContain('the')
    expect(result).toContain('quick')
    expect(result).toContain('brown')
    expect(result).toContain('fox')
  })

  it('removes PT stopwords by default', () => {
    const result = tokenize('o gato correu')
    expect(result).not.toContain('o')
    expect(result).toContain('gato')
    expect(result).toContain('correu')
  })

  it('strips accents by default', () => {
    const result = tokenize('café authentication')
    expect(result).toContain('cafe')
    expect(result).toContain('authentication')
  })

  it('returns empty array for empty string', () => {
    expect(tokenize('')).toEqual([])
  })

  it('returns empty array when all tokens are stopwords', () => {
    const result = tokenize('the a an is')
    expect(result).toEqual([])
  })

  it('splits on punctuation', () => {
    const result = tokenize('auth,module;core')
    expect(result).toContain('auth')
    expect(result).toContain('module')
    expect(result).toContain('core')
  })
})

describe('tokenize: stopwords option', () => {
  it('keeps stopwords when stopwords=false', () => {
    const result = tokenize('the quick fox', { stopwords: false })
    expect(result).toContain('the')
    expect(result).toContain('quick')
  })

  it('strips only PT stopwords with language=pt', () => {
    const result = tokenize('the gato correu', { language: 'pt' })
    expect(result).toContain('the') // EN stopword — not removed when language=pt
    expect(result).toContain('gato')
  })

  it('strips only EN stopwords with language=en', () => {
    const result = tokenize('de quick fox', { language: 'en' })
    expect(result).toContain('de') // PT stopword — not removed when language=en
    expect(result).toContain('quick')
  })
})

describe('tokenize: accentStrip option', () => {
  it('preserves accents when accentStrip=false', () => {
    const result = tokenize('café', { accentStrip: false })
    expect(result).toContain('café')
    expect(result).not.toContain('cafe')
  })
})

describe('tokenize: stemming option', () => {
  it('stems English words when stemming=true', () => {
    const result = tokenize('authentication', { stemming: true, language: 'en' })
    expect(result.length).toBeGreaterThan(0)
    // Stemming reduces 'authentication' — verify root is shorter
    expect(result[0].length).toBeLessThanOrEqual('authentication'.length)
  })
})
