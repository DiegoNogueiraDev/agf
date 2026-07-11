/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/mcp-cmd.ts — wires McpClient (node_wire_99049638d876),
 * the OAuth-capable MCP client facade that had no caller (src/core/mcp/mcp-client.ts),
 * and createTransport (node_wire_c94b2e286642), the dormant transport factory
 * that had no caller (src/core/mcp/mcp-transport.ts).
 */
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, it, expect, afterEach } from 'vitest'
import { mcpCommand } from '../cli/commands/mcp-cmd.js'

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

async function run(args: string[]): Promise<Record<string, unknown>> {
  const out: string[] = []
  const spy = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: unknown) => {
    out.push(String(chunk))
    return true
  }) as typeof process.stdout.write
  try {
    await mcpCommand().parseAsync(args, { from: 'user' })
  } finally {
    process.stdout.write = spy
  }
  return lastEnvelope(out)
}

describe('agf mcp inspect (node_wire_99049638d876)', () => {
  // AC1: GIVEN a --url config WHEN `agf mcp inspect` runs THEN it reports streamable-http transport and disconnected state
  it('reports transport type and disconnected state for a url-based server', async () => {
    const result = await run(['inspect', '--name', 'test-server', '--url', 'http://localhost:3000/mcp'])
    expect(result.ok).toBe(true)
    const data = result.data as { name: string; transportType: string; state: string; needsAuth: boolean }
    expect(data.name).toBe('test-server')
    expect(data.transportType).toBe('streamable-http')
    expect(data.state).toBe('disconnected')
    expect(data.needsAuth).toBe(true)
  })

  // AC2: GIVEN a --command config WHEN `agf mcp inspect` runs THEN it reports stdio transport
  it('reports stdio transport for a command-based server', async () => {
    const result = await run(['inspect', '--name', 'local-server', '--command', 'node', '--args', 'server.js'])
    expect(result.ok).toBe(true)
    const data = result.data as { transportType: string }
    expect(data.transportType).toBe('stdio')
  })

  // AC3: GIVEN neither --url nor --command WHEN `agf mcp inspect` runs THEN it fails with a clear error
  it('errors when neither --url nor --command is given', async () => {
    const result = await run(['inspect', '--name', 'broken-server'])
    expect(result.ok).toBe(false)
    expect(result.code).toBe('MISSING_TARGET')
  })
})

describe('agf mcp tool-context (node_wire_2dd252a5923c)', () => {
  // AC1: GIVEN tool count <= threshold WHEN `agf mcp tool-context` runs THEN it reports direct mode with all tools loaded
  it('resolves direct mode when tool count is at or below the threshold', async () => {
    const tools = JSON.stringify([{ name: 'a' }, { name: 'b' }])
    const result = await run(['tool-context', '--tools', tools, '--threshold', '2'])
    expect(result.ok).toBe(true)
    const data = result.data as { mode: string; loadedTools: unknown[]; searchHint: string }
    expect(data.mode).toBe('direct')
    expect(data.loadedTools).toHaveLength(2)
    expect(data.searchHint).toBe('')
  })

  // AC2: GIVEN tool count > threshold WHEN `agf mcp tool-context` runs THEN it reports deferred mode with a search hint
  it('resolves deferred mode when tool count exceeds the threshold', async () => {
    const tools = JSON.stringify([{ name: 'a' }, { name: 'b' }, { name: 'c' }])
    const result = await run(['tool-context', '--tools', tools, '--threshold', '2'])
    expect(result.ok).toBe(true)
    const data = result.data as { mode: string; loadedTools: unknown[]; searchHint: string }
    expect(data.mode).toBe('deferred')
    expect(data.loadedTools).toHaveLength(0)
    expect(data.searchHint).toContain('3 MCP tools available')
  })

  // AC3: GIVEN malformed --tools JSON WHEN `agf mcp tool-context` runs THEN it fails with a clear error
  it('errors when --tools is not valid JSON', async () => {
    const result = await run(['tool-context', '--tools', '{not json'])
    expect(result.ok).toBe(false)
    expect(result.code).toBe('INVALID_TOOLS')
  })
})

describe('agf mcp probe (node_wire_c94b2e286642)', () => {
  let server: http.Server | undefined

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()))
      server = undefined
    }
  })

  // AC1: GIVEN a --url server that answers /ping WHEN `agf mcp probe` runs THEN it reports reachable:true
  it('reports reachable:true for a url-based server that answers /ping', async () => {
    server = http.createServer((req, res) => {
      res.writeHead(200)
      res.end('ok')
    })
    await new Promise<void>((resolve) => server!.listen(0, resolve))
    const port = (server.address() as AddressInfo).port

    const result = await run(['probe', '--name', 'test-server', '--url', `http://localhost:${port}`])
    expect(result.ok).toBe(true)
    const data = result.data as { transportType: string; reachable: boolean }
    expect(data.transportType).toBe('streamable-http')
    expect(data.reachable).toBe(true)
  })

  // AC2: GIVEN a --url server that is not listening WHEN `agf mcp probe` runs THEN it reports reachable:false with an error
  it('reports reachable:false with an error for an unreachable url', async () => {
    const result = await run(['probe', '--name', 'dead-server', '--url', 'http://localhost:1'])
    expect(result.ok).toBe(true)
    const data = result.data as { reachable: boolean; error?: string }
    expect(data.reachable).toBe(false)
    expect(data.error).toBeTruthy()
  })

  // AC3: GIVEN a --command that spawns successfully WHEN `agf mcp probe` runs THEN it reports reachable:true with stdio transport
  it('reports reachable:true for a command that spawns successfully', async () => {
    const result = await run(['probe', '--name', 'local-server', '--command', process.execPath, '--args', '--version'])
    expect(result.ok).toBe(true)
    const data = result.data as { transportType: string; reachable: boolean }
    expect(data.transportType).toBe('stdio')
    expect(data.reachable).toBe(true)
  })

  // AC4: GIVEN neither --url nor --command WHEN `agf mcp probe` runs THEN it fails with a clear error
  it('errors when neither --url nor --command is given', async () => {
    const result = await run(['probe', '--name', 'broken-server'])
    expect(result.ok).toBe(false)
    expect(result.code).toBe('MISSING_TARGET')
  })

  // AC5: GIVEN a probe that completes normally (node_wire_af3ca2ac0779 — process-cleanup wiring)
  // THEN it does not leak SIGINT/SIGTERM listeners registered to guard against an interrupted spawn
  it('does not leak SIGINT/SIGTERM listeners after a stdio probe completes', async () => {
    const sigintBefore = process.listenerCount('SIGINT')
    const sigtermBefore = process.listenerCount('SIGTERM')

    const result = await run(['probe', '--name', 'local-server', '--command', process.execPath, '--args', '--version'])

    expect(result.ok).toBe(true)
    expect(process.listenerCount('SIGINT')).toBe(sigintBefore)
    expect(process.listenerCount('SIGTERM')).toBe(sigtermBefore)
  })
})
