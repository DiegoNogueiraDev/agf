/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Wires the dormant SentruxMcpAdapter (src/core/integrations/sentrux-mcp-adapter.ts)
 * into `agf doctor` — kept out of doctor-checks.ts to avoid growing that file past
 * the 800-line limit.
 */

import { SentruxMcpAdapter } from '../integrations/sentrux-mcp-adapter.js'
import type { SentruxHealthResult } from '../../schemas/sentrux.schema.js'
import type { CheckResult } from './doctor-types.js'

/**
 * Check Sentrux MCP server health via SentruxMcpAdapter#health (testable —
 * accepts an injected health call). Never throws: a rejected call (e.g. no
 * MCP client configured) soft-fails to a warning, mirroring checkSentruxHealthSafeWith.
 */
export async function checkSentruxMcpHealthWith(callHealth: () => Promise<SentruxHealthResult>): Promise<CheckResult> {
  try {
    const result = await callHealth()
    return {
      name: 'sentrux-mcp-health',
      level: 'ok',
      message: `Sentrux MCP server is ${result.status} (${result.latency_ms}ms)`,
    }
  } catch (err) {
    return {
      name: 'sentrux-mcp-health',
      level: 'warning',
      message: 'Sentrux MCP server not reachable',
      suggestion: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Check Sentrux MCP server health using the real SentruxMcpAdapter (production path).
 */
export function checkSentruxMcpHealth(): Promise<CheckResult> {
  const adapter = new SentruxMcpAdapter()
  return checkSentruxMcpHealthWith(() => adapter.health())
}
