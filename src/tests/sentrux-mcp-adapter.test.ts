/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/integrations/sentrux-mcp-adapter.ts — SentruxMcpAdapter.
 */

import { describe, it, expect, vi } from 'vitest'
import { SentruxMcpAdapter } from '../core/integrations/sentrux-mcp-adapter.js'

describe('SentruxMcpAdapter — default McpCallFn', () => {
  it('throws when no McpCallFn is injected', async () => {
    const adapter = new SentruxMcpAdapter()
    await expect(adapter.health()).rejects.toThrow('no MCP client configured')
  })
})

describe('SentruxMcpAdapter#health', () => {
  it('parses a valid health response', async () => {
    const call = vi.fn().mockResolvedValue({
      status: 'healthy',
      checks: [{ name: 'db', status: 'ok' }],
      latency_ms: 12,
    })
    const adapter = new SentruxMcpAdapter(call)
    const result = await adapter.health()
    expect(result.status).toBe('healthy')
    expect(result.latency_ms).toBe(12)
    expect(call).toHaveBeenCalledWith('health', {})
  })

  it('throws a descriptive error when the response fails schema validation', async () => {
    const call = vi.fn().mockResolvedValue({ status: 'not-a-valid-status' })
    const adapter = new SentruxMcpAdapter(call)
    await expect(adapter.health()).rejects.toThrow('sentrux:health parse error')
  })
})

describe('SentruxMcpAdapter#scan', () => {
  it('parses a valid scan response and forwards args', async () => {
    const call = vi.fn().mockResolvedValue({
      runId: 'run-1',
      issuesFound: 0,
      severity: 'ok',
      timestamp: '2026-07-11T00:00:00Z',
    })
    const adapter = new SentruxMcpAdapter(call)
    const result = await adapter.scan({ path: 'src' })
    expect(result.runId).toBe('run-1')
    expect(call).toHaveBeenCalledWith('scan', { path: 'src' })
  })
})
