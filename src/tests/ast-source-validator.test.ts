import { describe, it, expect } from 'vitest'
import { validateSource } from '../core/security/ast-source-validator.js'

describe('validateSource', () => {
  it('returns ok=true for safe code', () => {
    const result = validateSource('const x = 1 + 2')
    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('blocks process access', () => {
    const result = validateSource('const env = process.env')
    expect(result.ok).toBe(false)
    expect(result.violations.some((v) => v.kind === 'identifier')).toBe(true)
  })

  it('blocks eval', () => {
    const result = validateSource('eval("1+1")')
    expect(result.ok).toBe(false)
  })

  it('blocks require', () => {
    const result = validateSource('const fs = require("fs")')
    expect(result.ok).toBe(false)
  })

  it('blocks dynamic import', () => {
    const result = validateSource('const m = await import("fs")')
    expect(result.ok).toBe(false)
    expect(result.violations.some((v) => v.kind === 'dynamic-import')).toBe(true)
  })

  it('violations have message field', () => {
    const result = validateSource('process.exit(0)')
    expect(result.violations.every((v) => typeof v.message === 'string')).toBe(true)
  })

  it('returns parse violation for invalid code', () => {
    const result = validateSource('const = invalid !!!')
    expect(result.ok).toBe(false)
    expect(result.violations.some((v) => v.kind === 'parse')).toBe(true)
  })

  it('respects maxBytes option', () => {
    const largeSource = 'x'.repeat(100_001)
    const result = validateSource(largeSource, { maxBytes: 100 })
    expect(result.ok).toBe(false)
    expect(result.violations.some((v) => v.kind === 'size')).toBe(true)
  })

  it('allows arrow functions and simple expressions', () => {
    const safe = 'const add = (a, b) => a + b\nconst result = add(1, 2)'
    const result = validateSource(safe)
    expect(result.ok).toBe(true)
  })

  it('blocks globalThis', () => {
    const result = validateSource('const g = globalThis')
    expect(result.ok).toBe(false)
  })
})
