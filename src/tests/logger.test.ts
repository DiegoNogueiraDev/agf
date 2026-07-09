/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Tests for core/utils/logger.ts — createLogger, logger singleton, buffer
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { logger, createLogger, getLogBuffer, clearLogBuffer, setLogListener } from '../core/utils/logger.js'
import type { LogEntry } from '../schemas/log.schema.js'

beforeEach(() => {
  clearLogBuffer()
})

afterEach(() => {
  setLogListener(null)
  delete process.env.MCP_GRAPH_DEBUG
})

describe('logger singleton', () => {
  it.each(['info', 'warn', 'error', 'success'] as const)('logs at level %s without throwing', (level) => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    logger[level]('test message', { key: 'val' })
    expect(stderrSpy).toHaveBeenCalled()
    stderrSpy.mockRestore()
  })

  it('logs debug only when MCP_GRAPH_DEBUG is set', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    logger.debug('should not appear')
    expect(stderrSpy).not.toHaveBeenCalled()

    process.env.MCP_GRAPH_DEBUG = '1'
    logger.debug('should appear')
    expect(stderrSpy).toHaveBeenCalled()
    stderrSpy.mockRestore()
  })

  it('logger.event appends action/outcome fields', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    logger.event({ action: 'test_action', category: 'test', outcome: 'success' }, 'event fired')
    const entry = getLogBuffer()
    expect(entry).toHaveLength(1)
    expect(entry[0].context?.eventAction).toBe('test_action')
    expect(entry[0].context?.eventOutcome).toBe('success')
    stderrSpy.mockRestore()
  })

  it('logger.warn normalizes error context', () => {
    const err = new Error('boom')
    logger.warn('warning', { error: err })
    const entry = getLogBuffer()
    expect(entry).toHaveLength(1)
    expect(entry[0].context?.errorMessage).toBe('boom')
    expect(entry[0].context?.errorType).toBe('Error')
    expect(entry[0].context?.error).toBeUndefined()
  })

  it('logger.error normalizes error context', () => {
    const err = new TypeError('type fail')
    logger.error('fatal', { error: err, extra: 42 })
    const entry = getLogBuffer()
    expect(entry).toHaveLength(1)
    expect(entry[0].context?.errorMessage).toBe('type fail')
    expect(entry[0].context?.errorType).toBe('TypeError')
    expect(entry[0].context?.extra).toBe(42)
  })
})

describe('createLogger', () => {
  it('returns a logger with layer/source added to context', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const myLog = createLogger({ layer: 'api', source: 'my-module.ts' })
    myLog.info('hello')
    const entry = getLogBuffer()
    expect(entry).toHaveLength(1)
    expect(entry[0].context?.layer).toBe('api')
    expect(entry[0].context?.source).toBe('my-module.ts')
    stderrSpy.mockRestore()
  })

  it('factory tags override caller context', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const myLog = createLogger({ layer: 'core', source: 'override.ts' })
    myLog.info('test', { layer: 'cli', source: 'wrong.ts' })
    const entry = getLogBuffer()
    expect(entry[0].context?.layer).toBe('core')
    expect(entry[0].context?.source).toBe('override.ts')
    stderrSpy.mockRestore()
  })
})

describe('log buffer', () => {
  it('getLogBuffer returns a snapshot copy', () => {
    logger.info('a')
    logger.info('b')
    const buf1 = getLogBuffer()
    expect(buf1).toHaveLength(2)
    clearLogBuffer()
    const buf2 = getLogBuffer()
    expect(buf2).toHaveLength(0)
    expect(buf1).toHaveLength(2)
  })

  it('clearLogBuffer empties the buffer', () => {
    logger.info('x')
    expect(getLogBuffer()).toHaveLength(1)
    clearLogBuffer()
    expect(getLogBuffer()).toHaveLength(0)
  })

  it('overflows past 1000 entries trims oldest', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    for (let i = 0; i < 1010; i++) {
      logger.info(`msg-${i}`)
    }
    const buf = getLogBuffer()
    expect(buf).toHaveLength(1000)
    expect(buf[0].message).toBe('msg-10')
    stderrSpy.mockRestore()
  })
})

describe('setLogListener', () => {
  it('receives every new log entry', () => {
    const entries: LogEntry[] = []
    setLogListener((e) => entries.push(e))
    logger.info('first')
    logger.warn('second')
    expect(entries).toHaveLength(2)
    expect(entries[0].message).toBe('first')
    expect(entries[1].message).toBe('second')
  })

  it('passing null unregisters the listener', () => {
    const entries: LogEntry[] = []
    setLogListener((e) => entries.push(e))
    logger.info('a')
    setLogListener(null)
    logger.info('b')
    expect(entries).toHaveLength(1)
  })
})
