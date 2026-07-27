/*!
 * TDD: `agf sentrux <action>` CLI wiring (node_wire_e8dada293dd7).
 *
 * WHY: SentruxMcpAdapter (src/core/integrations/sentrux-mcp-adapter.ts) had no
 * surface consumer — it compiled and had schemas, but no CLI/TUI/MCP/web file
 * ever imported it, so `agf harness --dormant` flagged it "no-surface". This
 * tests the dispatch helper the CLI command delegates to, exercising both the
 * happy path (an injected McpCallFn) and the honest failure path (no client
 * configured — the adapter's own default throws, and the CLI must surface
 * that as a structured error, not an uncaught crash).
 */
import { describe, it, expect } from 'vitest'
import { callSentruxTool } from '../cli/commands/sentrux-cmd.js'
import { SentruxMcpAdapter, type McpCallFn } from '../core/integrations/sentrux-mcp-adapter.js'

describe('callSentruxTool', () => {
  it('dispatches "scan" through the adapter and returns the parsed result', async () => {
    const call: McpCallFn = async (tool) => {
      expect(tool).toBe('scan')
      return { runId: 'r1', issuesFound: 0, severity: 'ok', timestamp: '2026-07-12T00:00:00.000Z' }
    }
    const result = await callSentruxTool('scan', new SentruxMcpAdapter(call))
    expect(result).toMatchObject({ runId: 'r1', severity: 'ok' })
  })

  it('dispatches "health" through the adapter', async () => {
    const call: McpCallFn = async () => ({ status: 'healthy', checks: [], latency_ms: 12 })
    const result = await callSentruxTool('health', new SentruxMcpAdapter(call))
    expect(result).toMatchObject({ status: 'healthy' })
  })

  it('dispatches "session-end" with the sessionId arg', async () => {
    const call: McpCallFn = async (tool, args) => {
      expect(tool).toBe('session_end')
      expect(args).toEqual({ sessionId: 's1' })
      return { sessionId: 's1', endedAt: '2026-07-12T00:00:00.000Z', delta: {}, issuesDelta: -2 }
    }
    const result = await callSentruxTool('session-end', new SentruxMcpAdapter(call), { sessionId: 's1' })
    expect(result).toMatchObject({ sessionId: 's1', issuesDelta: -2 })
  })

  it('rejects "session-end" with no sessionId before calling the adapter', async () => {
    await expect(callSentruxTool('session-end', new SentruxMcpAdapter())).rejects.toThrow(/sessionId/)
  })

  it('surfaces the default adapter error instead of crashing when no client is configured', async () => {
    await expect(callSentruxTool('scan', new SentruxMcpAdapter())).rejects.toThrow(/no MCP client configured/)
  })
})
