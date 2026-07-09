/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Tests for core/utils/ecs-formatter.ts — extractErrorContext, toEcs
 */
import { describe, it, expect } from 'vitest'
import { extractErrorContext, toEcs, SERVICE_NAME } from '../core/utils/ecs-formatter.js'
import type { LogEntry } from '../schemas/log.schema.js'

describe('extractErrorContext', () => {
  it('returns undefined when ctx is undefined', () => {
    expect(extractErrorContext(undefined)).toBeUndefined()
  })

  it('returns ctx unchanged when no error key', () => {
    const ctx = { key: 'val' }
    expect(extractErrorContext(ctx)).toEqual(ctx)
  })

  it('extracts error fields and removes error key', () => {
    const err = new Error('boom')
    const result = extractErrorContext({ error: err, extra: 1 })
    expect(result).toBeDefined()
    expect(result!.errorMessage).toBe('boom')
    expect(result!.errorType).toBe('Error')
    expect(result!.errorStackTrace).toBeDefined()
    expect(typeof result!.errorStackTrace).toBe('string')
    expect(result!.extra).toBe(1)
    expect((result! as Record<string, unknown>).error).toBeUndefined()
  })

  it('handles non-Error in error key gracefully', () => {
    const ctx = { error: 'not an error object' }
    expect(extractErrorContext(ctx)).toEqual(ctx)
  })

  it('handles empty object', () => {
    expect(extractErrorContext({})).toEqual({})
  })

  it('handles TypeError subclass', () => {
    const err = new TypeError('type mismatch')
    const result = extractErrorContext({ error: err })
    expect(result!.errorMessage).toBe('type mismatch')
    expect(result!.errorType).toBe('TypeError')
  })
})

describe('toEcs', () => {
  const baseEntry: LogEntry = {
    id: 1,
    level: 'info',
    message: 'test',
    timestamp: '2024-01-01T00:00:00.000Z',
  }

  it('produces minimal ECS record', () => {
    const ecs = toEcs(baseEntry)
    expect(ecs['@timestamp']).toBe(baseEntry.timestamp)
    expect(ecs['log.level']).toBe('info')
    expect(ecs.message).toBe('test')
    expect(ecs['service.name']).toBe(SERVICE_NAME)
    expect(ecs['service.version']).toBeDefined()
  })

  it('maps reserved context keys to canonical ECS fields', () => {
    const entry: LogEntry = {
      ...baseEntry,
      context: {
        layer: 'core',
        source: 'test.ts',
        traceId: 'abc',
        spanId: 'def',
        eventAction: 'create',
        eventCategory: 'node',
        eventOutcome: 'success',
        errorMessage: 'oops',
        errorType: 'Error',
        errorStackTrace: 'at line 1',
      },
    }
    const ecs = toEcs(entry)
    expect(ecs['labels.layer']).toBe('core')
    expect(ecs['labels.source']).toBe('test.ts')
    expect(ecs['trace.id']).toBe('abc')
    expect(ecs['span.id']).toBe('def')
    expect(ecs['event.action']).toBe('create')
    expect(ecs['event.category']).toBe('node')
    expect(ecs['event.outcome']).toBe('success')
    expect(ecs['error.message']).toBe('oops')
    expect(ecs['error.type']).toBe('Error')
    expect(ecs['error.stack_trace']).toBe('at line 1')
  })

  it('preserves custom keys under labels.*', () => {
    const entry: LogEntry = {
      ...baseEntry,
      context: { customField: 'val', another: 42 },
    }
    const ecs = toEcs(entry)
    expect(ecs['labels.customField']).toBe('val')
    expect(ecs['labels.another']).toBe(42)
  })

  it('does not create labels.* for reserved keys duplicate in ecs', () => {
    const entry: LogEntry = {
      ...baseEntry,
      context: { layer: 'api', custom: true },
    }
    const ecs = toEcs(entry)
    expect(ecs['labels.layer']).toBe('api')
    expect(ecs['labels.custom']).toBe(true)
    expect(Object.keys(ecs).filter((k) => k.startsWith('labels.'))).toHaveLength(2)
  })

  it('handles entry without context', () => {
    const ecs = toEcs(baseEntry)
    expect(ecs['@timestamp']).toBeDefined()
    expect(Object.keys(ecs)).toEqual(['@timestamp', 'log.level', 'message', 'service.name', 'service.version'])
  })

  it('handles entry with empty context', () => {
    const ecs = toEcs({ ...baseEntry, context: {} })
    expect(ecs['@timestamp']).toBeDefined()
    expect(Object.keys(ecs)).toEqual(['@timestamp', 'log.level', 'message', 'service.name', 'service.version'])
  })
})
