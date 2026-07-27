import { describe, it, expect } from 'vitest'
import { generateHandlerId, parseToml, readSettingsFile } from '../core/hooks/import-helpers.js'
import { parseHookId } from '../core/hooks/hook-id-scheme.js'

describe('generateHandlerId', () => {
  it('returns a non-empty string', () => {
    const id = generateHandlerId('claude', 'PreToolUse', 0, 0)
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('includes the provider in the id', () => {
    const id = generateHandlerId('claude', 'PostToolUse', 0, 0)
    expect(id).toContain('claude')
  })

  it('includes the event channel in the id (lowercased)', () => {
    const id = generateHandlerId('codex', 'Stop', 0, 0)
    expect(id.toLowerCase()).toContain('stop')
  })

  it('generates different ids for different block indices', () => {
    const id1 = generateHandlerId('claude', 'PreToolUse', 0, 0)
    const id2 = generateHandlerId('claude', 'PreToolUse', 1, 0)
    expect(id1).not.toBe(id2)
  })

  it('produces an id that round-trips through hook-id-scheme.ts (node_wire_3a9dd8a66b40)', () => {
    const id = generateHandlerId('claude', 'PreToolUse', 2, 1)
    const parsed = parseHookId(id)
    expect(parsed).toEqual({ cli: 'claude', event: 'pretooluse', groupIndex: 2, hookIndex: 1 })
  })

  it('falls back to the manual format for a cli value makeHookId would reject (dash)', () => {
    const id = generateHandlerId('shell-hook', 'Stop', 0, 0)
    // makeHookId's cli part (/^[a-z][a-z0-9]+$/) rejects 'shell-hook' —
    // generateHandlerId falls back to the pre-existing manual format rather
    // than throwing. (parseHookId itself is more permissive on read — it can
    // reparse this same string with a different, ambiguous cli/event split —
    // so the fallback is confirmed via the exact string, not round-trip.)
    expect(id).toBe('shell-hook-stop-0-0')
  })
})

describe('parseToml', () => {
  it('parses a simple TOML string', () => {
    const result = parseToml('key = "value"')
    expect(result).toMatchObject({ key: 'value' })
  })

  it('parses TOML with integer value', () => {
    const result = parseToml('count = 42')
    expect(result).toMatchObject({ count: 42 })
  })

  it('parses TOML with boolean value', () => {
    const result = parseToml('enabled = true')
    expect(result).toMatchObject({ enabled: true })
  })

  it('parses TOML with array', () => {
    const result = parseToml('items = ["a", "b"]')
    expect(result).toMatchObject({ items: ['a', 'b'] })
  })
})

describe('readSettingsFile', () => {
  it('returns ok:false when file does not exist', () => {
    const result = readSettingsFile('/non/existent/path.json', 'json')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('not found')
    }
  })
})
