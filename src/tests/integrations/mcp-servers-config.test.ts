import { describe, it, expect } from 'vitest'
import { buildMcpServersConfig, MCP_SERVER_NAMES } from '../../core/integrations/mcp-servers-config.js'
import type { McpServersConfig } from '../../core/integrations/mcp-servers-config.js'

describe('mcp-servers-config', () => {
  describe('MCP_SERVER_NAMES', () => {
    it('includes graph-flow server', () => {
      expect(MCP_SERVER_NAMES).toContain('graph-flow')
    })
  })

  describe('buildMcpServersConfig', () => {
    it('returns mcpServers object with graph-flow server when no existing config', () => {
      const config = buildMcpServersConfig()

      expect(config.mcpServers).toBeDefined()
      expect(config.mcpServers['graph-flow']).toBeDefined()
      expect(config.mcpServers['graph-flow'].command).toBeDefined()
      expect(config.mcpServers['graph-flow'].args).toBeInstanceOf(Array)
    })

    it('preserves existing MCP servers and merges graph-flow', () => {
      const existing = {
        mcpServers: {
          sentrux: { command: 'sentrux', args: ['mcp'] },
        },
      }

      const config = buildMcpServersConfig(existing)

      expect(config.mcpServers['sentrux']).toEqual({ command: 'sentrux', args: ['mcp'] })
      expect(config.mcpServers['graph-flow']).toBeDefined()
    })

    it('does not duplicate graph-flow if already present in existing config', () => {
      const existing = {
        mcpServers: {
          'graph-flow': { command: 'custom-command', args: ['--custom-arg'] },
        },
      }

      const config = buildMcpServersConfig(existing)

      const keys = Object.keys(config.mcpServers).filter((k) => k === 'graph-flow')
      expect(keys.length).toBe(1)
    })

    it('adds all registered MCP_SERVER_NAMES', () => {
      const config = buildMcpServersConfig()

      for (const name of MCP_SERVER_NAMES) {
        expect(config.mcpServers[name]).toBeDefined()
      }
    })

    it('uses npx as default command when running inside node_modules', () => {
      const config = buildMcpServersConfig()

      for (const [, entry] of Object.entries(config.mcpServers)) {
        expect(entry.command === 'npx' || entry.command === 'node').toBe(true)
      }
    })
  })
})
