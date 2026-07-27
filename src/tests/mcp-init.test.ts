import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs')
vi.mock('node:child_process', () => ({
  execSync: vi.fn().mockReturnValue(Buffer.from('npx --version')),
  execFileSync: vi.fn().mockReturnValue(Buffer.from('/usr/bin/npx')),
}))

describe('mcp init-project helpers', () => {
  it('buildMcpServersConfig merges existing config', async () => {
    const { buildMcpServersConfig } = await import('../core/integrations/mcp-servers-config.js')

    const result = buildMcpServersConfig({
      mcpServers: {
        sentrux: { command: 'sentrux', args: ['mcp'] },
      },
    })

    expect(result.mcpServers['sentrux']).toBeDefined()
    expect(result.mcpServers['graph-flow']).toBeDefined()
  })

  it('buildMcpServersConfig always includes graph-flow', async () => {
    const { buildMcpServersConfig } = await import('../core/integrations/mcp-servers-config.js')

    const result = buildMcpServersConfig()
    expect(result.mcpServers['graph-flow']).toBeDefined()
    expect(result.mcpServers['graph-flow'].command).toBeTruthy()
  })

  it('MCP_SERVER_NAMES contains expected servers', async () => {
    const { MCP_SERVER_NAMES } = await import('../core/integrations/mcp-servers-config.js')

    expect(Array.isArray(MCP_SERVER_NAMES)).toBe(true)
    expect(MCP_SERVER_NAMES.length).toBeGreaterThan(0)
    expect(MCP_SERVER_NAMES[0]).toBe('graph-flow')
  })

  it('getIntegrationsStatus returns required fields', async () => {
    const { existsSync } = await import('node:fs')
    vi.mocked(existsSync).mockReturnValue(false)

    const { getIntegrationsStatus } = await import('../core/integrations/tool-status.js')

    const status = await getIntegrationsStatus('/tmp/test-project')

    expect(status).toHaveProperty('codeGraph')
    expect(status).toHaveProperty('memories')
    expect(status).toHaveProperty('playwright')
    expect(typeof status.codeGraph.symbolCount).toBe('number')
  })

  it('isCommandAvailable detects real or mocked commands', async () => {
    const { execFileSync } = await import('node:child_process')
    vi.mocked(execFileSync).mockReturnValue(Buffer.from('/usr/bin/npx'))

    const { isCommandAvailable } = await import('../core/integrations/mcp-deps-installer.js')

    const result = await isCommandAvailable('npx')
    expect(result).toBe(true)
  })

  it('installAllMcpDeps checks npx, uvx, and docker', async () => {
    const { execFileSync } = await import('node:child_process')
    vi.mocked(execFileSync).mockReturnValue(Buffer.from('/usr/bin/cmd'))

    const { installAllMcpDeps } = await import('../core/integrations/mcp-deps-installer.js')

    const results = await installAllMcpDeps('/tmp/test')
    expect(results.length).toBe(3)
    expect(results.map((r) => r.name).sort()).toEqual(['docker', 'npx', 'uvx'])
  })
})
