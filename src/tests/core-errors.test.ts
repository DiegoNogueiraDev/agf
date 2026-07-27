/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Tests for src/core/errors/ — error classes, envelope, structured logger
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { GraphError } from '../core/errors/graph-error.js'
import { McpError } from '../core/errors/mcp-error.js'
import { SandboxError } from '../core/errors/sandbox-error.js'
import { AgentDriverError } from '../core/errors/agent-driver-error.js'
import { ErrorKind, createEnvelope, isGraphError } from '../core/errors/error-envelope.js'
import type { ErrorEnvelope } from '../core/errors/error-envelope.js'
import { StructuredLogger, getLogBuffer, clearLogBuffer } from '../core/errors/structured-logger.js'

describe('GraphError', () => {
  it('is instance of Error with name', () => {
    const err = new GraphError('test')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('GraphError')
  })

  it('stores context', () => {
    const err = new GraphError('test', { key: 'val', num: 42 })
    expect(err.context).toEqual({ key: 'val', num: 42 })
  })

  it('defaults context to empty object', () => {
    const err = new GraphError('test')
    expect(err.context).toEqual({})
  })

  it('copies context so mutations do not leak', () => {
    const ctx = { original: true }
    const err = new GraphError('test', ctx)
    ctx.original = false
    expect(err.context.original).toBe(true)
  })

  it('has correct prototype chain', () => {
    const err = new GraphError('test')
    expect(Object.getPrototypeOf(err)).toBe(GraphError.prototype)
  })
})

describe('McpError', () => {
  it('extends GraphError with name McpError', () => {
    const err = new McpError('mcp fail')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(GraphError)
    expect(err).toBeInstanceOf(McpError)
    expect(err.name).toBe('McpError')
  })

  it('passes context through', () => {
    const err = new McpError('timeout', { code: 504 })
    expect(err.context).toEqual({ code: 504 })
  })
})

describe('SandboxError', () => {
  it('extends GraphError with name SandboxError', () => {
    const err = new SandboxError('sandbox crash')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(GraphError)
    expect(err).toBeInstanceOf(SandboxError)
    expect(err.name).toBe('SandboxError')
  })

  it('default context is empty', () => {
    const err = new SandboxError('fail')
    expect(err.context).toEqual({})
  })
})

describe('AgentDriverError', () => {
  it('extends GraphError with name AgentDriverError', () => {
    const err = new AgentDriverError('agent panic')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(GraphError)
    expect(err).toBeInstanceOf(AgentDriverError)
    expect(err.name).toBe('AgentDriverError')
  })

  it('passes context through', () => {
    const err = new AgentDriverError('oops', { agentId: 'a1' })
    expect(err.context).toEqual({ agentId: 'a1' })
  })
})

describe('ErrorKind', () => {
  it('has all expected constants', () => {
    expect(ErrorKind.Filesystem).toBe('filesystem')
    expect(ErrorKind.Auth).toBe('auth')
    expect(ErrorKind.Session).toBe('session')
    expect(ErrorKind.Parse).toBe('parse')
    expect(ErrorKind.Runtime).toBe('runtime')
    expect(ErrorKind.Mcp).toBe('mcp')
    expect(ErrorKind.Delivery).toBe('delivery')
    expect(ErrorKind.Usage).toBe('usage')
    expect(ErrorKind.Policy).toBe('policy')
    expect(ErrorKind.RateLimit).toBe('rate_limit')
    expect(ErrorKind.Validation).toBe('validation')
    expect(ErrorKind.Database).toBe('database')
    expect(ErrorKind.Network).toBe('network')
    expect(ErrorKind.Unknown).toBe('unknown')
  })

  it('is a const record with string values', () => {
    // as const in TS does not freeze at runtime, but values are string literals
    const values = Object.values(ErrorKind)
    expect(values.every((v) => typeof v === 'string')).toBe(true)
  })
})

describe('createEnvelope', () => {
  it('returns a copy of the input', () => {
    const input = {
      kind: ErrorKind.Runtime,
      operation: 'execute',
      target: 'node-1',
      retryable: false,
    }
    const result = createEnvelope(input)
    expect(result).toEqual(input)
    expect(result).not.toBe(input)
  })

  it('preserves optional hint', () => {
    const input: ErrorEnvelope = {
      kind: ErrorKind.Auth,
      operation: 'login',
      target: 'user-1',
      hint: 'token expired',
      retryable: true,
    }
    expect(createEnvelope(input).hint).toBe('token expired')
  })
})

describe('isGraphError', () => {
  it('returns true for GraphError instances', () => {
    expect(isGraphError(new GraphError('test'))).toBe(true)
    expect(isGraphError(new McpError('test'))).toBe(true)
    expect(isGraphError(new SandboxError('test'))).toBe(true)
    expect(isGraphError(new AgentDriverError('test'))).toBe(true)
  })

  it('returns false for plain Error', () => {
    expect(isGraphError(new Error('plain'))).toBe(false)
  })

  it('returns false for null and non-objects', () => {
    expect(isGraphError(null)).toBe(false)
    expect(isGraphError(undefined)).toBe(false)
    expect(isGraphError('string')).toBe(false)
    expect(isGraphError(42)).toBe(false)
  })

  it('returns false for objects without context', () => {
    expect(isGraphError({ name: 'SomeError', message: 'test' })).toBe(false)
  })
})

describe('StructuredLogger', () => {
  beforeEach(() => {
    clearLogBuffer()
    process.env.MCP_GRAPH_DEBUG = '1'
  })

  afterEach(() => {
    delete process.env.MCP_GRAPH_DEBUG
  })

  it('logs info messages', () => {
    const logger = new StructuredLogger('test-service')
    logger.info('hello', { extra: 'data' })
    const buf = getLogBuffer()
    expect(buf.length).toBeGreaterThanOrEqual(1)
    expect(buf[0].message).toBe('hello')
    expect(buf[0].level).toBe('info')
  })

  it('enriches with service name', () => {
    const logger = new StructuredLogger('my-svc')
    logger.info('test')
    const buf = getLogBuffer()
    expect(buf[0].context?.service).toBe('my-svc')
  })

  it('logs warn messages', () => {
    const logger = new StructuredLogger('test')
    logger.warn('caution')
    const buf = getLogBuffer()
    expect(buf[0].level).toBe('warn')
    expect(buf[0].message).toBe('caution')
  })

  it('logs error messages', () => {
    const logger = new StructuredLogger('test')
    logger.error('boom', { kind: 'runtime', operation: 'exec' })
    const buf = getLogBuffer()
    expect(buf[0].level).toBe('error')
    expect(buf[0].message).toBe('boom')
  })

  it('logs success messages', () => {
    const logger = new StructuredLogger('test')
    logger.success('done')
    const buf = getLogBuffer()
    expect(buf[0].level).toBe('success')
  })

  it('logs debug messages', () => {
    const logger = new StructuredLogger('test')
    logger.debug('verbose')
    const buf = getLogBuffer()
    expect(buf[0].level).toBe('debug')
  })

  it('preserves user context in info', () => {
    const logger = new StructuredLogger('svc')
    logger.info('msg', { userId: 'u1' })
    const buf = getLogBuffer()
    expect(buf[0].context?.userId).toBe('u1')
    expect(buf[0].context?.service).toBe('svc')
  })
})

describe('instanceof chain consistency', () => {
  const cases = [McpError, SandboxError, AgentDriverError]

  for (const Klass of cases) {
    it(`${Klass.name} is instance of GraphError and Error`, () => {
      const err = new Klass('test')
      expect(err).toBeInstanceOf(Error)
      expect(err).toBeInstanceOf(GraphError)
      expect(err).toBeInstanceOf(Klass)
      expect(err.name).toBe(Klass.name)
    })
  }
})
