/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'

describe('checkSentruxMcpHealth (node_wire_1a895820979f — sentrux-mcp-adapter wire)', () => {
  it('is ok and reports the status when the MCP adapter responds', async () => {
    const { checkSentruxMcpHealthWith } = await import('../core/doctor/sentrux-mcp-health-check.js')
    const result = await checkSentruxMcpHealthWith(async () => ({
      status: 'healthy',
      latency_ms: 12,
      version: '1.0.0',
    }))
    expect(result.level).toBe('ok')
    expect(result.name).toBe('sentrux-mcp-health')
    expect(result.message).toContain('healthy')
  })

  it('is a warning when the MCP adapter call throws (no MCP client configured)', async () => {
    const { checkSentruxMcpHealthWith } = await import('../core/doctor/sentrux-mcp-health-check.js')
    const result = await checkSentruxMcpHealthWith(async () => {
      throw new Error('SentruxMcpAdapter: no MCP client configured')
    })
    expect(result.level).toBe('warning')
    expect(result.suggestion).toBeDefined()
  })

  it('checkSentruxMcpHealth (production path) resolves without throwing', async () => {
    const { checkSentruxMcpHealth } = await import('../core/doctor/sentrux-mcp-health-check.js')
    await expect(checkSentruxMcpHealth()).resolves.not.toThrow()
    const result = await checkSentruxMcpHealth()
    expect(result.name).toBe('sentrux-mcp-health')
  })
})
