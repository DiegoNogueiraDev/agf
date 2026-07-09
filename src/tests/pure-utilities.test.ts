/*!
 * Tests for three small pure utility functions across separate modules.
 *
 * collectHostValues (plugins/config-injector.ts):
 *   Extracts api_key and base_url from a config object. Pure, no I/O.
 *
 * defaultDaemonRoot (daemon/daemon-reaper.ts):
 *   Returns path.join(home, '.mcp-graph'). Pure string transform.
 *
 * hooksDisabled (hooks/hook-runtime.ts):
 *   Returns true when MCP_GRAPH_HOOKS_DISABLED='true' OR AGF_HOOKS='0'.
 *   Reads process.env — tested by setting/unsetting env vars.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { collectHostValues } from '../core/plugins/config-injector.js'
import { defaultDaemonRoot } from '../core/daemon/daemon-reaper.js'
import { hooksDisabled } from '../core/hooks/hook-runtime.js'
import path from 'node:path'

// ── collectHostValues ─────────────────────────────────────────────────────────

describe('collectHostValues', () => {
  it('returns empty object for empty config', () => {
    expect(collectHostValues({})).toEqual({})
  })

  it('extracts api_key when present', () => {
    const result = collectHostValues({ api_key: 'sk-test-123' })
    expect(result.api_key).toBe('sk-test-123')
  })

  it('extracts base_url when present', () => {
    const result = collectHostValues({ base_url: 'https://api.example.com' })
    expect(result.base_url).toBe('https://api.example.com')
  })

  it('extracts both api_key and base_url together', () => {
    const result = collectHostValues({ api_key: 'key-abc', base_url: 'https://api.example.com' })
    expect(result.api_key).toBe('key-abc')
    expect(result.base_url).toBe('https://api.example.com')
  })

  it('ignores unknown keys (only api_key and base_url extracted)', () => {
    const result = collectHostValues({ api_key: 'k', foo: 'bar', extra: 42 })
    expect(result.api_key).toBe('k')
    expect('foo' in result).toBe(false)
    expect('extra' in result).toBe(false)
  })

  it('coerces non-string api_key to string', () => {
    const result = collectHostValues({ api_key: 12345 })
    expect(result.api_key).toBe('12345')
  })

  it('does not set api_key when config has no api_key', () => {
    const result = collectHostValues({ base_url: 'https://x.com' })
    expect(result.api_key).toBeUndefined()
  })
})

// ── defaultDaemonRoot ─────────────────────────────────────────────────────────

describe('defaultDaemonRoot', () => {
  it('returns path ending with .mcp-graph', () => {
    const result = defaultDaemonRoot('/home/user')
    expect(result).toBe(path.join('/home/user', '.mcp-graph'))
  })

  it('is deterministic for the same home', () => {
    const r1 = defaultDaemonRoot('/root')
    const r2 = defaultDaemonRoot('/root')
    expect(r1).toBe(r2)
  })

  it('different homes produce different roots', () => {
    const r1 = defaultDaemonRoot('/home/alice')
    const r2 = defaultDaemonRoot('/home/bob')
    expect(r1).not.toBe(r2)
  })

  it('result contains .mcp-graph as the last segment', () => {
    const result = defaultDaemonRoot('/tmp/test')
    expect(path.basename(result)).toBe('.mcp-graph')
  })
})

// ── hooksDisabled ─────────────────────────────────────────────────────────────

describe('hooksDisabled', () => {
  const savedMcpGraphHooksDisabled = process.env['MCP_GRAPH_HOOKS_DISABLED']
  const savedAgfHooks = process.env['AGF_HOOKS']

  beforeEach(() => {
    delete process.env['MCP_GRAPH_HOOKS_DISABLED']
    delete process.env['AGF_HOOKS']
  })

  afterEach(() => {
    if (savedMcpGraphHooksDisabled !== undefined) {
      process.env['MCP_GRAPH_HOOKS_DISABLED'] = savedMcpGraphHooksDisabled
    } else {
      delete process.env['MCP_GRAPH_HOOKS_DISABLED']
    }
    if (savedAgfHooks !== undefined) {
      process.env['AGF_HOOKS'] = savedAgfHooks
    } else {
      delete process.env['AGF_HOOKS']
    }
  })

  it('returns false when neither env var is set', () => {
    expect(hooksDisabled()).toBe(false)
  })

  it('returns true when MCP_GRAPH_HOOKS_DISABLED=true', () => {
    process.env['MCP_GRAPH_HOOKS_DISABLED'] = 'true'
    expect(hooksDisabled()).toBe(true)
  })

  it('returns true when AGF_HOOKS=0', () => {
    process.env['AGF_HOOKS'] = '0'
    expect(hooksDisabled()).toBe(true)
  })

  it('returns false when MCP_GRAPH_HOOKS_DISABLED=false', () => {
    process.env['MCP_GRAPH_HOOKS_DISABLED'] = 'false'
    expect(hooksDisabled()).toBe(false)
  })

  it('returns false when AGF_HOOKS=1', () => {
    process.env['AGF_HOOKS'] = '1'
    expect(hooksDisabled()).toBe(false)
  })
})
