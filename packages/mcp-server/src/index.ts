#! /usr/bin/env node
/**
 * agent-graph-flow MCP Server — Thin Bridge Adapter
 *
 * Exposes mcp-graph tools via Model Context Protocol (stdio transport)
 * for Claude Desktop and Claude Code integration.
 *
 * This bridge is PURE transport + delegation. All business logic
 * (lifecycle, DoD, context, flow) lives in `src/core/**`.
 * The bridge only:
 *   1. Opens the SQLite graph database (read-only query adapter)
 *   2. Registers MCP tool schemas
 *   3. Delegates every tool call to core service equivalents
 *
 * Configuration (claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "agent-graph-flow": {
 *         "command": "node",
 *         "args": ["/path/to/packages/mcp-server/dist/index.js", "--project-dir", "/path/to/project"]
 *       }
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { GraphStore, openStore } from './store.js'

// ── Project directory resolution ────────────────────────

function resolveProjectDir(): string {
  const args = process.argv.slice(2)
  const dirIdx = args.indexOf('--project-dir')
  if (dirIdx !== -1 && args[dirIdx + 1]) return args[dirIdx + 1]
  const eqArg = args.find((a) => a.startsWith('--project-dir='))
  if (eqArg) return eqArg.split('=')[1]
  return process.cwd()
}

const projectDir = resolveProjectDir()
const store = openStore(projectDir)

function getStore(): GraphStore {
  if (!store) {
    console.error(`No graph.db found in ${projectDir}/workflow-graph/. Run 'agent-graph-flow init' first.`)
    process.exit(1)
  }
  return store
}

getStore()

// ── MCP Server (transport layer only) ───────────────────

const server = new Server({ name: 'agent-graph-flow', version: '0.2.0' }, { capabilities: { tools: {} } })

// ── Tool catalog (pure schema — no business logic) ──────

import { TOOLS } from './tools-catalog.js'

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

// ── Tool delegation (thin dispatch — zero logic here) ───

import { delegateTool } from './tool-delegates.js'

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  const result = await delegateTool(name, args ?? {}, getStore())
  return { content: [{ type: 'text', text: result }] }
})

// ── Main ────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error(
    `agent-graph-flow MCP server running (project: ${projectDir}, nodes: ${getStore().getAllNodes().length})`,
  )
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
