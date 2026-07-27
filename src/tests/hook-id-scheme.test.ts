/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { makeHookId, parseHookId, isValidHookId } from '../core/hooks/hook-id-scheme.js'

describe('makeHookId', () => {
  it('creates an ID with all parts including hookIndex', () => {
    const id = makeHookId({ cli: 'claude', event: 'pretooluse', groupIndex: 0, hookIndex: 0 })
    expect(id).toBe('claude-pretooluse-0-0')
  })

  it('creates an ID without hookIndex', () => {
    const id = makeHookId({ cli: 'codex', event: 'notification', groupIndex: 0 })
    expect(id).toBe('codex-notification-0')
  })

  it('throws for invalid CLI name', () => {
    expect(() => makeHookId({ cli: '123', event: 'test', groupIndex: 0 })).toThrow(/hook-id:invalid-cli/)
    expect(() => makeHookId({ cli: '', event: 'test', groupIndex: 0 })).toThrow()
    expect(() => makeHookId({ cli: 'UPPER', event: 'test', groupIndex: 0 })).toThrow()
  })

  it('throws for invalid event name', () => {
    expect(() => makeHookId({ cli: 'cli', event: '', groupIndex: 0 })).toThrow(/hook-id:invalid-event/)
    expect(() => makeHookId({ cli: 'cli', event: 'UPPER', groupIndex: 0 })).toThrow()
  })

  it('throws for invalid groupIndex', () => {
    expect(() => makeHookId({ cli: 'cli', event: 'test', groupIndex: -1 })).toThrow(/hook-id:invalid-groupIndex/)
    expect(() => makeHookId({ cli: 'cli', event: 'test', groupIndex: 1.5 })).toThrow(/hook-id:invalid-groupIndex/)
  })

  it('throws for invalid hookIndex', () => {
    expect(() => makeHookId({ cli: 'cli', event: 'test', groupIndex: 0, hookIndex: -1 })).toThrow(
      /hook-id:invalid-hookIndex/,
    )
    expect(() => makeHookId({ cli: 'cli', event: 'test', groupIndex: 0, hookIndex: 1.5 })).toThrow(
      /hook-id:invalid-hookIndex/,
    )
  })

  it('accepts descriptive example IDs', () => {
    const id = makeHookId({ cli: 'opencode', event: 'stop', groupIndex: 2 })
    expect(id).toBe('opencode-stop-2')
  })
})

describe('parseHookId', () => {
  it('parses id with hookIndex', () => {
    const parts = parseHookId('claude-pretooluse-0-0')
    expect(parts).toBeDefined()
    expect(parts!.cli).toBe('claude')
    expect(parts!.event).toBe('pretooluse')
    expect(parts!.groupIndex).toBe(0)
    expect(parts!.hookIndex).toBe(0)
  })

  it('parses id without hookIndex', () => {
    const parts = parseHookId('codex-notification-0')
    expect(parts).toBeDefined()
    expect(parts!.cli).toBe('codex')
    expect(parts!.event).toBe('notification')
    expect(parts!.groupIndex).toBe(0)
    expect(parts!.hookIndex).toBeUndefined()
  })

  it('parses multi-word event names', () => {
    const parts = parseHookId('mcp-graph-pre-tool-use-1')
    expect(parts).toBeDefined()
    expect(parts!.cli).toBe('mcp')
    expect(parts!.event).toBe('graph-pre-tool-use')
    expect(parts!.groupIndex).toBe(1)
  })

  it('returns undefined for invalid format', () => {
    expect(parseHookId('')).toBeUndefined()
    expect(parseHookId('no-dashes')).toBeUndefined()
    expect(parseHookId('cli-event')).toBeUndefined()
    expect(parseHookId('cli-event-abc')).toBeUndefined()
    expect(parseHookId('-cli-event-0')).toBeUndefined()
  })
})

describe('isValidHookId', () => {
  it('returns true for valid IDs', () => {
    expect(isValidHookId('claude-pretooluse-0-0')).toBe(true)
    expect(isValidHookId('codex-notification-0')).toBe(true)
  })

  it('returns false for invalid IDs', () => {
    expect(isValidHookId('')).toBe(false)
    expect(isValidHookId('invalid')).toBe(false)
    expect(isValidHookId('no-dashes-here')).toBe(false)
  })
})

describe('makeHookId + parseHookId roundtrip', () => {
  it('roundtrips with hookIndex', () => {
    const input = { cli: 'codex', event: 'pre-tool-use', groupIndex: 2, hookIndex: 1 }
    const id = makeHookId(input)
    const parsed = parseHookId(id)
    expect(parsed).toEqual(input)
  })

  it('roundtrips without hookIndex', () => {
    const input = { cli: 'opencode', event: 'session-end', groupIndex: 0 }
    const id = makeHookId(input)
    const parsed = parseHookId(id)
    expect(parsed!.cli).toBe(input.cli)
    expect(parsed!.event).toBe(input.event)
    expect(parsed!.groupIndex).toBe(input.groupIndex)
    expect(parsed!.hookIndex).toBeUndefined()
  })
})
