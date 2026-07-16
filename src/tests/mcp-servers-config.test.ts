/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_9068c3cec2b9 — C73-T1: tests for buildMcpServersConfig
 *
 * AC: always includes graph-flow entry; merges existing entries;
 *     blast gate passes
 */

import { describe, it, expect } from 'vitest'
import { buildMcpServersConfig, MCP_SERVER_NAMES } from '../core/integrations/mcp-servers-config.js'

describe('buildMcpServersConfig', () => {
  it('returns an object with mcpServers key', () => {
    const config = buildMcpServersConfig()
    expect(config).toHaveProperty('mcpServers')
    expect(typeof config.mcpServers).toBe('object')
  })

  it('includes all MCP_SERVER_NAMES entries', () => {
    const config = buildMcpServersConfig()
    for (const name of MCP_SERVER_NAMES) {
      expect(config.mcpServers).toHaveProperty(name)
    }
  })

  it('graph-flow entry has command and args', () => {
    const config = buildMcpServersConfig()
    const entry = config.mcpServers['graph-flow']
    expect(entry).toBeDefined()
    expect(typeof entry.command).toBe('string')
    expect(Array.isArray(entry.args)).toBe(true)
  })

  it('preserves existing entries from input', () => {
    const existing = {
      mcpServers: {
        'custom-server': { command: 'node', args: ['custom.js'] },
      },
    }
    const config = buildMcpServersConfig(existing)
    expect(config.mcpServers).toHaveProperty('custom-server')
    expect(config.mcpServers['custom-server'].command).toBe('node')
  })

  it('does not override existing graph-flow entry if already present', () => {
    const existing = {
      mcpServers: {
        'graph-flow': { command: 'custom-cmd', args: ['--custom'] },
      },
    }
    const config = buildMcpServersConfig(existing)
    expect(config.mcpServers['graph-flow'].command).toBe('custom-cmd')
  })

  it('works with no arguments (undefined existing)', () => {
    expect(() => buildMcpServersConfig(undefined)).not.toThrow()
    expect(() => buildMcpServersConfig()).not.toThrow()
  })

  it('works with empty mcpServers object', () => {
    const config = buildMcpServersConfig({ mcpServers: {} })
    expect(MCP_SERVER_NAMES.every((n) => n in config.mcpServers)).toBe(true)
  })

  it('MCP_SERVER_NAMES contains at least one entry', () => {
    expect(MCP_SERVER_NAMES.length).toBeGreaterThan(0)
  })
})
