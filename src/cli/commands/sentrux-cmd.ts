/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * agf sentrux <action> — CLI surface for SentruxMcpAdapter (§EPIC-sentrux-adoption).
 *
 * WHY: the adapter wraps 9 Sentrux MCP tools but had no CLI/TUI/MCP/web
 * consumer, so it never ran outside a unit test. Wiring it here does not
 * require a live Sentrux server: the adapter's default McpCallFn throws a
 * clear error when none is injected, and this command surfaces that as a
 * structured envelope instead of a crash.
 */

import { Command } from 'commander'
import { createCliOutput } from '../shared/cli-output.js'
import { getErrorMessage } from '../../core/utils/errors.js'
import { SentruxMcpAdapter } from '../../core/integrations/sentrux-mcp-adapter.js'

const SENTRUX_ACTIONS = [
  'scan',
  'health',
  'check-rules',
  'rescan',
  'evolution',
  'dsm',
  'test-gaps',
  'session-start',
  'session-end',
] as const

export type SentruxAction = (typeof SENTRUX_ACTIONS)[number]

/** Dispatch one Sentrux action through the given adapter instance. Pure/injectable — no CLI I/O. */
export async function callSentruxTool(
  action: SentruxAction,
  adapter: SentruxMcpAdapter,
  args: { sessionId?: string; label?: string } = {},
): Promise<unknown> {
  switch (action) {
    case 'scan':
      return adapter.scan()
    case 'health':
      return adapter.health()
    case 'check-rules':
      return adapter.checkRules()
    case 'rescan':
      return adapter.rescan()
    case 'evolution':
      return adapter.evolution()
    case 'dsm':
      return adapter.dsm()
    case 'test-gaps':
      return adapter.testGaps()
    case 'session-start':
      return adapter.sessionStart({ label: args.label })
    case 'session-end':
      if (!args.sessionId) throw new Error('session-end requires sessionId (--session-id)')
      return adapter.sessionEnd({ sessionId: args.sessionId })
  }
}

const ACTION_DESCRIPTIONS: Record<SentruxAction, string> = {
  scan: 'Run a Sentrux quality scan',
  health: 'Check Sentrux server health',
  'check-rules': 'List active Sentrux rule violations',
  rescan: 'Re-run the last Sentrux scan',
  evolution: 'Fetch Sentrux quality-trend snapshots',
  dsm: 'Fetch the Sentrux dependency structure matrix',
  'test-gaps': 'Fetch Sentrux test-coverage gaps',
  'session-start': 'Start a Sentrux quality session',
  'session-end': 'End a Sentrux quality session and report the issue delta',
}

function buildSubcommand(action: SentruxAction): Command {
  const sub = new Command(action).description(ACTION_DESCRIPTIONS[action])
  if (action === 'session-start') sub.option('--label <label>', 'Session label')
  if (action === 'session-end') sub.requiredOption('--session-id <id>', 'Session id from `sentrux session-start`')
  return sub.action(async (opts: { sessionId?: string; label?: string }) => {
    const out = createCliOutput(`sentrux.${action}`)
    try {
      out.ok(await callSentruxTool(action, new SentruxMcpAdapter(), opts))
    } catch (err) {
      out.err('SENTRUX_CALL_FAILED', getErrorMessage(err))
    }
  })
}

/** Builds the `agf sentrux` CLI command (Commander definition). */
export function sentruxCommand(): Command {
  const cmd = new Command('sentrux').description(
    'Sentrux MCP tool bridge: scan, session lifecycle, quality gates (requires a live Sentrux MCP server)',
  )
  for (const action of SENTRUX_ACTIONS) cmd.addCommand(buildSubcommand(action))
  return cmd
}
