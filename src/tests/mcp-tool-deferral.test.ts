/*!
 * TDD: MCP tool deferral — lazy-load when count > threshold (node_26cc6556f4c9).
 *
 * AC1: >N tools → defs not all loaded; search path exposed instead.
 * AC2: <=N tools → direct load (no deferral).
 */

import { describe, it, expect } from 'vitest'
import { resolveMcpToolContext, DEFAULT_TOOL_DEFERRAL_THRESHOLD } from '../core/mcp/mcp-tool-deferral.js'
import type { McpToolDefinition } from '../core/mcp/mcp-tool-sync.js'

function makeTools(count: number): McpToolDefinition[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `tool_${i}`,
    description: `Tool number ${i}`,
    inputSchema: { type: 'object', properties: {} },
  }))
}

describe('AC1: >N tools — deferred (search path, not all defs)', () => {
  it('returns deferred mode when tools exceed threshold', () => {
    const tools = makeTools(DEFAULT_TOOL_DEFERRAL_THRESHOLD + 1)
    const ctx = resolveMcpToolContext(tools, DEFAULT_TOOL_DEFERRAL_THRESHOLD)
    expect(ctx.mode).toBe('deferred')
    expect(ctx.loadedTools).toHaveLength(0)
    expect(ctx.searchHint).toBeTruthy()
  })

  it('deferred mode includes total tool count in search hint', () => {
    const tools = makeTools(DEFAULT_TOOL_DEFERRAL_THRESHOLD + 5)
    const ctx = resolveMcpToolContext(tools, DEFAULT_TOOL_DEFERRAL_THRESHOLD)
    expect(ctx.searchHint).toContain(String(tools.length))
  })
})

describe('AC2: <=N tools — direct load (no deferral)', () => {
  it('returns direct mode when tools at or below threshold', () => {
    const tools = makeTools(DEFAULT_TOOL_DEFERRAL_THRESHOLD)
    const ctx = resolveMcpToolContext(tools, DEFAULT_TOOL_DEFERRAL_THRESHOLD)
    expect(ctx.mode).toBe('direct')
    expect(ctx.loadedTools).toHaveLength(DEFAULT_TOOL_DEFERRAL_THRESHOLD)
  })

  it('returns direct mode for empty tool list', () => {
    const ctx = resolveMcpToolContext([], DEFAULT_TOOL_DEFERRAL_THRESHOLD)
    expect(ctx.mode).toBe('direct')
    expect(ctx.loadedTools).toHaveLength(0)
  })
})
