/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  generateShellHooks,
  type ShellHookOptions,
  type ShellHookResult,
} from '../core/cli-provider/shell-hook-provider.js'

describe('generateShellHooks', () => {
  it('generates handlers for all expected channels by default', () => {
    const result = generateShellHooks()
    expect(result.handlers.length).toBeGreaterThan(0)
    const channels = new Set(result.handlers.map((h) => h.channel))
    expect(channels.has('session:start')).toBe(true)
    expect(channels.has('session:end')).toBe(true)
    expect(channels.has('tool:pre-call')).toBe(true)
    expect(channels.has('tool:post-call')).toBe(true)
  })

  it('each handler has required fields', () => {
    const result = generateShellHooks()
    for (const h of result.handlers) {
      expect(h.id).toBeDefined()
      expect(h.id.length).toBeGreaterThan(0)
      expect(h.channel).toBeDefined()
      expect(h.kind).toBe('shell')
      expect(h.command).toBeDefined()
      expect(h.commandArgs).toBeDefined()
      expect(Array.isArray(h.commandArgs)).toBe(true)
      expect(h.enabled).toBe(true)
    }
  })

  it('uses agf as default CLI path', () => {
    const result = generateShellHooks()
    for (const h of result.handlers) {
      expect(h.command).toBe('agf')
    }
  })

  it('uses custom CLI path when provided', () => {
    const result = generateShellHooks({ cliPath: '/usr/local/bin/agf' })
    for (const h of result.handlers) {
      expect(h.command).toBe('/usr/local/bin/agf')
    }
  })

  it('filters by specific channels when provided', () => {
    const result = generateShellHooks({ channels: ['session:start', 'session:end'] })
    expect(result.handlers).toHaveLength(2)
    expect(result.handlers[0].channel).toBe('session:start')
    expect(result.handlers[1].channel).toBe('session:end')
  })

  it('configures agentSource as mcp-graph by default', () => {
    const result = generateShellHooks()
    for (const h of result.handlers) {
      expect(h.agentSource).toBe('mcp-graph')
    }
  })

  it('uses custom agentSource when provided', () => {
    const result = generateShellHooks({ agentSource: 'opencode' })
    for (const h of result.handlers) {
      expect(h.agentSource).toBe('opencode')
    }
  })

  it('each handler has a timeout configured', () => {
    const result = generateShellHooks()
    for (const h of result.handlers) {
      expect(h.timeoutMs).toBeGreaterThan(0)
    }
  })

  it('session:start handler invokes agf with hook session-start', () => {
    const result = generateShellHooks({ channels: ['session:start'] })
    expect(result.handlers).toHaveLength(1)
    expect(result.handlers[0].commandArgs).toContain('hook')
    expect(result.handlers[0].commandArgs).toContain('session-start')
  })

  it('tool:pre-call handler invokes agf with hook tool-pre-call', () => {
    const result = generateShellHooks({ channels: ['tool:pre-call'] })
    expect(result.handlers).toHaveLength(1)
    expect(result.handlers[0].commandArgs).toContain('hook')
    expect(result.handlers[0].commandArgs).toContain('tool-pre-call')
  })

  it('result has generatedAt timestamp', () => {
    const result = generateShellHooks()
    expect(result.generatedAt).toBeDefined()
    expect(typeof result.generatedAt).toBe('string')
    expect(() => new Date(result.generatedAt)).not.toThrow()
  })

  it('result has provider field set to mcp-graph', () => {
    const result = generateShellHooks()
    expect(result.provider).toBe('mcp-graph')
  })
})

describe('ShellHookOptions type', () => {
  it('accepts partial options', () => {
    const opts: ShellHookOptions = {}
    expect(opts).toBeDefined()
  })

  it('accepts all options', () => {
    const opts: ShellHookOptions = {
      cliPath: '/test/agf',
      channels: ['session:start'],
      agentSource: 'codex',
    }
    expect(opts.cliPath).toBe('/test/agf')
    expect(opts.channels).toHaveLength(1)
    expect(opts.agentSource).toBe('codex')
  })
})

describe('ShellHookResult type', () => {
  it('conforms to expected shape', () => {
    const result: ShellHookResult = {
      handlers: [],
      generatedAt: new Date().toISOString(),
      provider: 'mcp-graph',
    }
    expect(result.handlers).toHaveLength(0)
    expect(result.provider).toBe('mcp-graph')
  })
})
