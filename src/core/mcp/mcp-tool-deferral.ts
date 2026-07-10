/*!
 * mcp-tool-deferral — threshold-based lazy-load for MCP tool definitions.
 *
 * WHY: When an MCP server exposes many tools, injecting all definitions into
 * context wastes tokens and pollutes the prompt. Above `threshold` tools,
 * we switch to a search-on-demand path and return a hint instead of all defs.
 *
 * Pure function — no I/O. Caller provides the tool list and threshold.
 * Extends McpToolRegistry surface (src/core/mcp/mcp-tool-sync.ts).
 */

import type { McpToolDefinition } from './mcp-tool-sync.js'

/** Tools at or below this count load directly; above it, deferral kicks in. */
export const DEFAULT_TOOL_DEFERRAL_THRESHOLD = 20

export type McpToolContextMode = 'direct' | 'deferred'

export interface McpToolContext {
  mode: McpToolContextMode
  /** Populated with all definitions in direct mode; empty in deferred mode. */
  loadedTools: McpToolDefinition[]
  /**
   * Human-readable hint for agents in deferred mode, explaining how to
   * surface specific tool definitions on demand. Empty string in direct mode.
   */
  searchHint: string
}

/**
 * Resolve whether to load all MCP tool definitions or defer to search.
 *
 * @param tools    - Full list of available MCP tools.
 * @param threshold - Max tools to load directly. Defaults to DEFAULT_TOOL_DEFERRAL_THRESHOLD.
 */
export function resolveMcpToolContext(
  tools: McpToolDefinition[],
  threshold: number = DEFAULT_TOOL_DEFERRAL_THRESHOLD,
): McpToolContext {
  if (tools.length > threshold) {
    return {
      mode: 'deferred',
      loadedTools: [],
      searchHint: `${tools.length} MCP tools available. Definitions deferred to reduce context size. Search for specific tools by name on demand.`,
    }
  }
  return {
    mode: 'direct',
    loadedTools: [...tools],
    searchHint: '',
  }
}
