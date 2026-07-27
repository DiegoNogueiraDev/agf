import { describe, it, expect } from 'vitest'
import { slugify, nextAdrNumber, buildAdrBody } from '../core/knowledge/adr-store.js'
import type { AdrInput } from '../core/knowledge/adr-store.js'

describe('slugify', () => {
  it('lowercases the title', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('replaces spaces with dashes', () => {
    expect(slugify('use sqlite for persistence')).toBe('use-sqlite-for-persistence')
  })

  it('removes leading and trailing dashes', () => {
    const result = slugify('  test  ')
    expect(result).not.toMatch(/^-/)
    expect(result).not.toMatch(/-$/)
  })

  it('truncates to 60 chars', () => {
    const long = 'a'.repeat(100)
    expect(slugify(long).length).toBeLessThanOrEqual(60)
  })

  it('returns empty string for empty input', () => {
    expect(slugify('')).toBe('')
  })

  it('handles special characters', () => {
    const result = slugify('Use REST API (v2)')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('nextAdrNumber', () => {
  it('returns 1 for empty list', () => {
    expect(nextAdrNumber([])).toBe(1)
  })

  it('returns next number after highest existing', () => {
    expect(nextAdrNumber(['adr-0001-foo.md', 'adr-0003-bar.md'])).toBe(4)
  })

  it('ignores non-adr filenames', () => {
    expect(nextAdrNumber(['README.md', 'index.ts'])).toBe(1)
  })

  it('handles single file', () => {
    expect(nextAdrNumber(['adr-0005-something.md'])).toBe(6)
  })
})

describe('buildAdrBody', () => {
  function makeInput(overrides: Partial<AdrInput> = {}): AdrInput {
    return {
      title: 'Use SQLite',
      decision: 'We will use SQLite for the graph store.',
      consequences: 'Simple local storage, no network deps.',
      ...overrides,
    }
  }

  it('returns a string', () => {
    const body = buildAdrBody(makeInput(), 1)
    expect(typeof body).toBe('string')
  })

  it('includes the title', () => {
    const body = buildAdrBody(makeInput({ title: 'Use SQLite' }), 1)
    expect(body).toContain('Use SQLite')
  })

  it('includes the decision text', () => {
    const body = buildAdrBody(makeInput(), 1)
    expect(body).toContain('We will use SQLite')
  })

  it('includes the ADR number', () => {
    const body = buildAdrBody(makeInput(), 7)
    expect(body).toContain('7') // number must appear somewhere
  })

  it('includes consequences', () => {
    const body = buildAdrBody(makeInput(), 1)
    expect(body).toContain('Simple local storage')
  })
})
