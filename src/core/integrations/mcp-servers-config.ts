export type McpServerName = string
export interface McpServerEntry {
  command: string
  args: string[]
}
export interface McpServersConfig {
  mcpServers: Record<string, McpServerEntry>
}

export const MCP_SERVER_NAMES: McpServerName[] = ['graph-flow']

function resolveGraphFlowEntry(): McpServerEntry {
  // Local-first: use the project's own bridge package, not an external npm dep.
  const binPath = process.argv[1]
  if (binPath && binPath.includes('node_modules')) {
    return { command: 'npx', args: ['-y', 'agent-graph-flow-mcp-server'] }
  }
  // Default: point to the local packages/mcp-server bridge
  return { command: 'node', args: ['packages/mcp-server/dist/index.js', '--project-dir', process.cwd()] }
}

export function buildMcpServersConfig(
  existing?: Partial<{ mcpServers: Record<string, { command: string; args: string[] }> }>,
): McpServersConfig {
  const merged: Record<string, McpServerEntry> = {}

  if (existing?.mcpServers) {
    for (const [name, entry] of Object.entries(existing.mcpServers)) {
      merged[name] = { command: entry.command, args: [...entry.args] }
    }
  }

  for (const name of MCP_SERVER_NAMES) {
    if (!merged[name]) {
      merged[name] = resolveGraphFlowEntry()
    }
  }

  return { mcpServers: merged }
}
