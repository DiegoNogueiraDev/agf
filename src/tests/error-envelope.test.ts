import { describe, it, expect } from 'vitest'
import { createEnvelope, isGraphError, ErrorKind } from '../core/errors/error-envelope.js'
import { GraphError } from '../core/errors/graph-error.js'

describe('createEnvelope', () => {
  it('returns an ErrorEnvelope with the same fields', () => {
    const input = {
      kind: ErrorKind.Filesystem as const,
      operation: 'read',
      target: '/tmp/file.txt',
      retryable: true,
    }
    const result = createEnvelope(input)
    expect(result).toEqual(input)
  })

  it('includes optional hint when provided', () => {
    const result = createEnvelope({
      kind: ErrorKind.Auth,
      operation: 'login',
      target: 'api.example.com',
      hint: 'check your API key',
      retryable: false,
    })
    expect(result.hint).toBe('check your API key')
  })
})

describe('isGraphError', () => {
  it('returns true for GraphError instances', () => {
    const e = new GraphError('test', { id: 1 })
    expect(isGraphError(e)).toBe(true)
  })

  it('returns false for plain Error', () => {
    expect(isGraphError(new Error('plain'))).toBe(false)
  })

  it('returns false for non-Error values', () => {
    expect(isGraphError('string')).toBe(false)
    expect(isGraphError(null)).toBe(false)
    expect(isGraphError(42)).toBe(false)
  })
})
