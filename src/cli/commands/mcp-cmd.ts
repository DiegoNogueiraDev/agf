/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * `agf mcp` — CLI surface for src/core/mcp/mcp-client.ts and mcp-tool-deferral.ts.
 *
 * `inspect` exposes McpClient's config/transport/auth-state inspection so a
 * driving agent can check what transport agf would use for a remote MCP
 * server, and whether it needs OAuth, before wiring the server into a real
 * connection. Deliberately does not perform network calls or open a browser —
 * it only reports the client's local state (constructor + detectTransport +
 * needsAuth).
 *
 * `tool-context` exposes resolveMcpToolContext so an agent can check, given a
 * tool list and threshold, whether agf would load definitions directly or
 * defer to search-on-demand — without needing a live server connection.
 *
 * `probe`, unlike `inspect`, DOES make a real connection attempt via
 * createTransport (src/core/mcp/mcp-transport.ts) — it spawns/connects, then
 * immediately closes, to report whether the configured server is actually
 * reachable before an agent wires it into a real session. The spawn/close
 * window is guarded by ProcessCleanup (src/core/mcp/process-cleanup.ts) so an
 * interrupted probe (SIGINT/SIGTERM) still terminates the spawned MCP server
 * child process instead of orphaning it.
 */

import { basename } from 'node:path'
import { Command } from 'commander'
import { z } from 'zod'
import { McpClient } from '../../core/mcp/mcp-client.js'
import { createTransport } from '../../core/mcp/mcp-transport.js'
import { resolveMcpToolContext, DEFAULT_TOOL_DEFERRAL_THRESHOLD } from '../../core/mcp/mcp-tool-deferral.js'
import { ProcessCleanup, registerCleanupOnSignals } from '../../core/mcp/process-cleanup.js'
import { assertTrustedMcpServer } from '../../core/security/registry-allowlist.js'
import { getErrorMessage } from '../../core/utils/errors.js'
import { createCliOutput } from '../shared/cli-output.js'

function mcpInspectCommand(): Command {
  return new Command('inspect')
    .description('Inspect the transport and auth state agf would use for a remote MCP server (no network calls)')
    .requiredOption('--name <name>', 'Server name')
    .option('--url <url>', 'Remote MCP server URL (streamable-http/sse transport)')
    .option('--command <command>', 'Local command to spawn (stdio transport)')
    .option('--args <args>', 'Comma-separated args for --command')
    .option('--client-id <clientId>', 'OAuth client_id')
    .option('--scopes <scopes>', 'Comma-separated OAuth scopes')
    .action(
      (opts: { name: string; url?: string; command?: string; args?: string; clientId?: string; scopes?: string }) => {
        const out = createCliOutput('mcp.inspect')
        if (!opts.url && !opts.command) {
          out.err('MISSING_TARGET', 'One of --url or --command is required')
          return
        }

        const client = new McpClient({
          name: opts.name,
          url: opts.url,
          command: opts.command,
          args: opts.args ? opts.args.split(',').map((a) => a.trim()) : undefined,
          clientId: opts.clientId,
          scopes: opts.scopes ? opts.scopes.split(',').map((s) => s.trim()) : undefined,
        })

        out.ok({
          name: opts.name,
          transportType: client.transportType,
          state: client.getState(),
          needsAuth: client.needsAuth(),
        })
      },
    )
}

const mcpToolListSchema = z.array(
  z.object({
    name: z.string(),
    description: z.string().optional(),
    inputSchema: z.record(z.string(), z.unknown()).optional(),
  }),
)

function mcpToolContextCommand(): Command {
  return new Command('tool-context')
    .description(
      'Resolve whether MCP tool definitions load directly or defer to search, based on --threshold (no network calls)',
    )
    .requiredOption('--tools <json>', 'JSON-encoded McpToolDefinition[] (e.g. [{"name":"foo"}])')
    .option('--threshold <n>', 'Max tools to load directly before deferring', String(DEFAULT_TOOL_DEFERRAL_THRESHOLD))
    .action((opts: { tools: string; threshold: string }) => {
      const out = createCliOutput('mcp.tool-context')
      let raw: unknown
      try {
        raw = JSON.parse(opts.tools)
      } catch (err) {
        out.err('INVALID_TOOLS', `--tools is not valid JSON: ${err instanceof Error ? err.message : String(err)}`)
        return
      }

      const parsed = mcpToolListSchema.safeParse(raw)
      if (!parsed.success) {
        out.err('INVALID_TOOLS', `--tools does not match McpToolDefinition[]: ${parsed.error.message}`)
        return
      }

      const threshold = Number(opts.threshold)
      if (!Number.isFinite(threshold) || threshold < 0) {
        out.err('INVALID_THRESHOLD', `--threshold must be a non-negative number, got "${opts.threshold}"`)
        return
      }

      out.ok(resolveMcpToolContext(parsed.data, threshold))
    })
}

function mcpProbeCommand(): Command {
  return new Command('probe')
    .description(
      'Attempt to connect to a configured MCP server and report reachability (makes a real network/spawn call)',
    )
    .requiredOption('--name <name>', 'Server name')
    .option('--url <url>', 'Remote MCP server URL (streamable-http transport)')
    .option('--command <command>', 'Local command to spawn (stdio transport)')
    .option('--args <args>', 'Comma-separated args for --command')
    .action(async (opts: { name: string; url?: string; command?: string; args?: string }) => {
      const out = createCliOutput('mcp.probe')
      if (!opts.url && !opts.command) {
        out.err('MISSING_TARGET', 'One of --url or --command is required')
        return
      }

      if (opts.command) {
        try {
          assertTrustedMcpServer({
            command: basename(opts.command),
            args: opts.args ? opts.args.split(',').map((a) => a.trim()) : [],
          })
        } catch (err) {
          out.err('UNTRUSTED_MCP_SERVER', getErrorMessage(err))
          return
        }
      }

      const transport = createTransport({
        name: opts.name,
        url: opts.url,
        command: opts.command,
        args: opts.args ? opts.args.split(',').map((a) => a.trim()) : undefined,
      })

      const cleanup = new ProcessCleanup()
      const unregister = registerCleanupOnSignals(cleanup)

      try {
        await transport.connect()
        cleanup.register({ name: opts.name, pid: transport.pid ?? -1, onCleanup: () => transport.close() })
        await cleanup.shutdown()
        out.ok({ name: opts.name, transportType: transport.type, reachable: true })
      } catch (err) {
        out.ok({
          name: opts.name,
          transportType: transport.type,
          reachable: false,
          error: err instanceof Error ? err.message : String(err),
        })
      } finally {
        unregister()
      }
    })
}

/** Builds the `agf mcp` CLI command (Commander definition). */
export function mcpCommand(): Command {
  const cmd = new Command('mcp').description('Remote MCP client inspection (transport/auth state, no network calls)')
  cmd.addCommand(mcpInspectCommand())
  cmd.addCommand(mcpToolContextCommand())
  cmd.addCommand(mcpProbeCommand())
  return cmd
}
