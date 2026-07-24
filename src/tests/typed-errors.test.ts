/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * task-typed-errors — Typed error classes + StructuredLogger tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  GraphError,
  McpError,
  SandboxError,
  AgentDriverError,
  StructuredLogger,
  clearLogBuffer,
  getLogBuffer,
} from '../core/errors/index.js'

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

describe('GraphError', () => {
  it('has name, message, and context', () => {
    const err = new GraphError('graph operation failed', { nodeId: 'n1', phase: 'IMPLEMENT' })
    expect(err.name).toBe('GraphError')
    expect(err.message).toBe('graph operation failed')
    expect(err.context).toEqual({ nodeId: 'n1', phase: 'IMPLEMENT' })
  })

  it('is instance of Error', () => {
    const err = new GraphError('test')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(GraphError)
  })

  it('has empty context by default', () => {
    const err = new GraphError('test')
    expect(err.context).toEqual({})
  })

  it('has stack trace', () => {
    const err = new GraphError('test')
    expect(err.stack).toBeDefined()
    expect(typeof err.stack).toBe('string')
  })
})

describe('McpError', () => {
  it('has name, message, and context', () => {
    const err = new McpError('MCP handshake failed', { tool: 'add_node', errorCode: 500 })
    expect(err.name).toBe('McpError')
    expect(err.message).toBe('MCP handshake failed')
    expect(err.context).toEqual({ tool: 'add_node', errorCode: 500 })
  })

  it('is instance of GraphError and Error', () => {
    const err = new McpError('test')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(GraphError)
    expect(err).toBeInstanceOf(McpError)
  })
})

describe('SandboxError', () => {
  it('has name, message, and context', () => {
    const err = new SandboxError('sandbox timeout', { isolation: 'docker', durationMs: 30000 })
    expect(err.name).toBe('SandboxError')
    expect(err.message).toBe('sandbox timeout')
    expect(err.context).toEqual({ isolation: 'docker', durationMs: 30000 })
  })

  it('is instance of GraphError and Error', () => {
    const err = new SandboxError('test')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(GraphError)
    expect(err).toBeInstanceOf(SandboxError)
  })
})

describe('AgentDriverError', () => {
  it('has name, message, and context', () => {
    const err = new AgentDriverError('LLM call failed', { model: 'claude-sonnet', attempt: 3 })
    expect(err.name).toBe('AgentDriverError')
    expect(err.message).toBe('LLM call failed')
    expect(err.context).toEqual({ model: 'claude-sonnet', attempt: 3 })
  })

  it('is instance of GraphError and Error', () => {
    const err = new AgentDriverError('test')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(GraphError)
    expect(err).toBeInstanceOf(AgentDriverError)
  })
})

// ---------------------------------------------------------------------------
// StructuredLogger
// ---------------------------------------------------------------------------

describe('StructuredLogger', () => {
  beforeEach(() => {
    clearLogBuffer()
  })

  afterEach(() => {
    clearLogBuffer()
  })

  it('logs info with service, message, context, timestamp', () => {
    const log = new StructuredLogger('test-service')
    log.info('test message', { key: 'value' })

    const entries = getLogBuffer()
    expect(entries.length).toBe(1)
    const entry = entries[0]
    expect(entry.level).toBe('info')
    expect(entry.message).toBe('test message')
    expect(entry.timestamp).toBeDefined()
    expect(entry.context).toBeDefined()
    expect(entry.context?.service).toBe('test-service')
    expect(entry.context?.key).toBe('value')
  })

  it('logs warn with service', () => {
    const log = new StructuredLogger('test-service')
    log.warn('warning message')

    const entries = getLogBuffer()
    expect(entries.length).toBe(1)
    expect(entries[0].level).toBe('warn')
    expect(entries[0].context?.service).toBe('test-service')
  })

  it('logs error with service', () => {
    const log = new StructuredLogger('test-service')
    log.error('error message')

    const entries = getLogBuffer()
    expect(entries.length).toBe(1)
    expect(entries[0].level).toBe('error')
    expect(entries[0].context?.service).toBe('test-service')
  })

  it('logs with nodeId in context', () => {
    const log = new StructuredLogger('test-service')
    log.info('task started', { nodeId: 'task-001' })

    const entries = getLogBuffer()
    expect(entries[0].context?.nodeId).toBe('task-001')
    expect(entries[0].context?.service).toBe('test-service')
  })

  it('logs success with service', () => {
    const log = new StructuredLogger('test-service')
    log.success('completed')

    const entries = getLogBuffer()
    expect(entries.length).toBe(1)
    expect(entries[0].level).toBe('success')
  })

  it('logs debug in debug mode', () => {
    vi.stubEnv('MCP_GRAPH_DEBUG', '1')
    const log = new StructuredLogger('test-service')
    log.debug('debug info')

    const entries = getLogBuffer()
    expect(entries.length).toBe(1)
    expect(entries[0].level).toBe('debug')
    vi.unstubAllEnvs()
  })

  it('allows multiple log entries with correct ordering', () => {
    const log = new StructuredLogger('multi-service')
    log.info('first')
    log.error('second')
    log.info('third')

    const entries = getLogBuffer()
    expect(entries.length).toBe(3)
    expect(entries[0].message).toBe('first')
    expect(entries[1].message).toBe('second')
    expect(entries[2].message).toBe('third')
    expect(entries[0].id).toBeLessThan(entries[2].id)
  })
})

// ---------------------------------------------------------------------------
// Error-to-log integration
// ---------------------------------------------------------------------------

describe('Error logging integration', () => {
  beforeEach(() => {
    clearLogBuffer()
  })

  it('logs an error with GraphError context', () => {
    const log = new StructuredLogger('agent-driver')
    const err = new GraphError('task failed', { nodeId: 'n42', retryAttempt: 2 })

    log.error('implementation failed', { error: err, nodeId: 'n42' })

    const entries = getLogBuffer()
    expect(entries.length).toBe(1)
    expect(entries[0].level).toBe('error')
    // extractErrorContext should have moved error fields to context
    expect(entries[0].context?.errorMessage).toBe('task failed')
    expect(entries[0].context?.errorType).toBe('GraphError')
    expect(entries[0].context?.nodeId).toBe('n42')
    expect(entries[0].context?.service).toBe('agent-driver')
  })
})
