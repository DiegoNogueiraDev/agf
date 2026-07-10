/*!
 * Tests for src/core/parser/read-docx.ts
 */
import { describe, it, expect } from 'vitest'
import { isDocxSupported } from '../core/parser/read-docx.js'

describe('isDocxSupported', () => {
  it('returns true for .docx', () => {
    expect(isDocxSupported('.docx')).toBe(true)
  })

  it('returns true for .doc', () => {
    expect(isDocxSupported('.doc')).toBe(true)
  })

  it('is case-insensitive for .DOCX', () => {
    expect(isDocxSupported('.DOCX')).toBe(true)
  })

  it('returns false for .pdf', () => {
    expect(isDocxSupported('.pdf')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isDocxSupported('')).toBe(false)
  })
})
