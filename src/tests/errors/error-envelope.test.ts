import { describe, it, expect } from 'vitest'
import { ErrorKind, type ErrorEnvelope, createEnvelope, isGraphError } from '../../core/errors/error-envelope.js'
import { GraphError } from '../../core/errors/graph-error.js'

describe('ErrorKind', () => {
  it('contains expected error kinds', () => {
    expect(Object.keys(ErrorKind).length).toBeGreaterThanOrEqual(5)
    expect(ErrorKind.Runtime).toBe('runtime')
    expect(ErrorKind.Auth).toBe('auth')
    expect(ErrorKind.Session).toBe('session')
  })
})

describe('createEnvelope', () => {
  it('creates envelope with all required fields', () => {
    const env = createEnvelope({
      kind: ErrorKind.Filesystem,
      operation: 'write',
      target: '/tmp/test.txt',
      hint: 'Check permissions on parent directory',
      retryable: true,
    })

    expect(env.kind).toBe('filesystem')
    expect(env.operation).toBe('write')
    expect(env.target).toBe('/tmp/test.txt')
    expect(env.hint).toBe('Check permissions on parent directory')
    expect(env.retryable).toBe(true)
  })

  it('creates envelope without optional hint', () => {
    const env = createEnvelope({
      kind: ErrorKind.Runtime,
      operation: 'parse',
      target: 'config.json',
      retryable: false,
    })
    expect(env.hint).toBeUndefined()
    expect(env.retryable).toBe(false)
  })
})

describe('GraphError with envelope', () => {
  it('extends GraphError with envelope fields', () => {
    const error = new GraphError('test error', {
      kind: ErrorKind.Auth,
      operation: 'login',
      target: 'ANTHROPIC_API_KEY',
      hint: 'Set ANTHROPIC_API_KEY env var',
      retryable: false,
    })

    expect(error.message).toBe('test error')
    expect(error.context.kind).toBe('auth')
    expect(error.context.operation).toBe('login')
    expect(error.context.target).toBe('ANTHROPIC_API_KEY')
    expect(error.context.hint).toBe('Set ANTHROPIC_API_KEY env var')
    expect(error.context.retryable).toBe(false)
    expect(error.name).toBe('GraphError')
  })

  it('works without envelope fields (backward compat)', () => {
    const error = new GraphError('old style', { someData: 1 })
    expect(error.message).toBe('old style')
    expect(error.context.someData).toBe(1)
  })
})

describe('isGraphError', () => {
  it('returns true for GraphError instances', () => {
    expect(isGraphError(new GraphError('test'))).toBe(true)
  })

  it('returns false for plain Error', () => {
    expect(isGraphError(new Error('plain'))).toBe(false)
  })

  it('returns false for non-errors', () => {
    expect(isGraphError(null)).toBe(false)
    expect(isGraphError('string')).toBe(false)
  })
})

describe('serialization', () => {
  it('serializes envelope to JSON', () => {
    const env: ErrorEnvelope = {
      kind: ErrorKind.RateLimit,
      operation: 'api_call',
      target: 'claude-3-opus',
      hint: 'Wait 5 seconds before retrying',
      retryable: true,
    }

    const json = JSON.stringify(env)
    const parsed = JSON.parse(json) as ErrorEnvelope

    expect(parsed.kind).toBe('rate_limit')
    expect(parsed.retryable).toBe(true)
  })
})
