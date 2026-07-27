/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Characterization tests for buildMcpServersConfig
 * (src/core/integrations/mcp-servers-config.ts).
 * Capture current behavior that MUST survive consolidation.
 * GREEN = confirms current behavior is recorded.
 */

import { describe, it, expect } from 'vitest'
import { buildMcpServersConfig, MCP_SERVER_NAMES } from '../core/integrations/mcp-servers-config.js'

describe('Characterization: buildMcpServersConfig', () => {
  describe('without existing config', () => {
    it('returns config with graph-flow server entry', () => {
      const config = buildMcpServersConfig()
      expect(config).toHaveProperty('mcpServers')
      expect(config.mcpServers).toHaveProperty('graph-flow')
      expect(config.mcpServers['graph-flow']).toHaveProperty('command')
      expect(config.mcpServers['graph-flow']).toHaveProperty('args')
      expect(Array.isArray(config.mcpServers['graph-flow'].args)).toBe(true)
    })

    it('generated command is npx', () => {
      const config = buildMcpServersConfig()
      expect(config.mcpServers['graph-flow'].command).toBe('npx')
    })

    it('generated args include mcp-graph package', () => {
      const config = buildMcpServersConfig()
      const args = config.mcpServers['graph-flow'].args
      expect(args.includes('-y')).toBe(true)
      // Currently points to the agent-graph-flow MCP server package
      const packageArg = args.find((a) => !a.startsWith('-'))
      expect(packageArg).toBeDefined()
    })
  })

  describe('with existing config', () => {
    it('preserves existing server entries', () => {
      const existing = {
        mcpServers: {
          filesystem: { command: 'npx', args: ['-y', 'filesystem-server'] },
        },
      }
      const config = buildMcpServersConfig(existing)
      expect(config.mcpServers).toHaveProperty('filesystem')
      expect(config.mcpServers['filesystem'].command).toBe('npx')
    })

    it('does not overwrite existing graph-flow entry', () => {
      const existing = {
        mcpServers: {
          'graph-flow': { command: 'node', args: ['/custom/path'] },
        },
      }
      const config = buildMcpServersConfig(existing)
      expect(config.mcpServers['graph-flow'].command).toBe('node')
      expect(config.mcpServers['graph-flow'].args).toEqual(['/custom/path'])
    })
  })

  describe('MCP_SERVER_NAMES', () => {
    it('contains graph-flow', () => {
      expect(MCP_SERVER_NAMES).toContain('graph-flow')
    })
  })
})
