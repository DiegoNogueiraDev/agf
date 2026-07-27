/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Doc Generator — composes markdown sections from introspection data.
 * Used by the auto-docs update step and the /docs API route.
 */

import type { ToolInfo } from './tool-introspector.js'
import type { RouteInfo } from './route-introspector.js'

/**
 * Generate README stats table (tools, endpoints counts).
 */
export function generateReadmeStats(tools: ToolInfo[], routes: RouteInfo[]): string {
  const activeTools = tools.filter((t) => !t.deprecated)
  const deprecatedTools = tools.filter((t) => t.deprecated)
  const totalEndpoints = routes.reduce((sum, r) => sum + r.endpoints.length, 0)

  return `| | Count | Reference |
|---|---|---|
| **MCP Tools** | ${activeTools.length} + ${deprecatedTools.length} deprecated | [MCP-TOOLS-REFERENCE.md](docs/reference/MCP-TOOLS-REFERENCE.md) |
| **REST Endpoints** | ${totalEndpoints} (${routes.length} routers) | [REST-API-REFERENCE.md](docs/reference/REST-API-REFERENCE.md) |`
}

/**
 * Generate architecture guide MCP tools section.
 */
export function generateArchToolSection(tools: ToolInfo[]): string {
  const activeTools = tools.filter((t) => !t.deprecated)
  const deprecatedTools = tools.filter((t) => t.deprecated)

  // Group by category
  const byCategory = new Map<string, ToolInfo[]>()
  for (const tool of activeTools) {
    const existing = byCategory.get(tool.category) ?? []
    existing.push(tool)
    byCategory.set(tool.category, existing)
  }

  const lines = [
    `${activeTools.length + deprecatedTools.length} tool registrations (${activeTools.length} active + ${deprecatedTools.length} deprecated shims) via \`@modelcontextprotocol/sdk\`. Two transport modes:`,
    '',
    '- **HTTP** (`server.ts`) — Express server with `/mcp` endpoint + REST API + static dashboard',
    '- **Stdio** (`stdio.ts`) — Standard I/O transport for direct MCP client integration',
    '',
    'Tool categories:',
  ]

  for (const [category, categoryTools] of byCategory) {
    const names = categoryTools.map((t) => t.name).join(', ')
    lines.push(`- **${category}** (${categoryTools.length}) — ${names}`)
  }

  if (deprecatedTools.length > 0) {
    const depNames = deprecatedTools.map((t) => t.name).join(', ')
    lines.push(`- **Deprecated shims** (${deprecatedTools.length}) — ${depNames} (removed in v7.0)`)
  }

  return lines.join('\n')
}

/**
 * Generate architecture guide REST API section.
 */
export function generateArchRouteSection(routes: RouteInfo[]): string {
  const totalEndpoints = routes.reduce((sum, r) => sum + r.endpoints.length, 0)
  return `${routes.length} routers, ${totalEndpoints} endpoints. Modular router architecture:`
}

/**
 * Generate MCP-TOOLS-REFERENCE.md summary header and table.
 */
export function generateToolRefSummary(tools: ToolInfo[]): string {
  const activeTools = tools.filter((t) => !t.deprecated)
  const deprecatedTools = tools.filter((t) => t.deprecated)

  // Group by category
  const byCategory = new Map<string, ToolInfo[]>()
  for (const tool of activeTools) {
    const existing = byCategory.get(tool.category) ?? []
    existing.push(tool)
    byCategory.set(tool.category, existing)
  }

  const lines = [
    `> ${activeTools.length} tools + ${deprecatedTools.length} deprecated organized in ${byCategory.size + 1} categories — complete parameter reference.`,
    '',
    '## Summary',
    '',
    '| Category | Tools | Count |',
    '|----------|-------|-------|',
  ]

  for (const [category, categoryTools] of byCategory) {
    const names = categoryTools.map((t) => t.name).join(', ')
    lines.push(`| ${category} | ${names} | ${categoryTools.length} |`)
  }

  if (deprecatedTools.length > 0) {
    const depNames = deprecatedTools.map((t) => t.name).join(', ')
    lines.push(`| Deprecated | ${depNames} | ${deprecatedTools.length} |`)
  }

  return lines.join('\n')
}
