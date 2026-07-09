/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * `agf doctor` check for the optional Serena symbol-retrieval bridge.
 *
 * Mirrors doctor-checks-sentrux.ts: Serena is a third-party MCP server the user
 * may not be running, so its absence is a `warning` with a suggestion, never
 * an error. checkSerenaHealth already never throws, so this wrapper stays a
 * thin translation from SerenaHealthResult to CheckResult.
 *
 * Consumers: doctor-runner.ts (the `serena-health` surface).
 */

import { checkSerenaHealth, type SerenaHealthResult } from '../integrations/serena-health.js'
import type { CheckResult } from './doctor-types.js'

/**
 * Check Serena health (testable — accepts an injected probe).
 */
export async function checkSerenaHealthSafeWith(
  probe: () => Promise<SerenaHealthResult>,
): Promise<CheckResult> {
  const result = await probe()
  if (result.connected) {
    return {
      name: 'serena-health',
      level: 'ok',
      message: `Serena ${result.version ?? 'unknown'} detected`,
    }
  }
  return {
    name: 'serena-health',
    level: 'warning',
    message: 'Serena MCP server not reachable',
    suggestion: 'Start the Serena MCP server or set SERENA_URL to point at a running instance',
  }
}

/**
 * Check Serena health using the real checkSerenaHealth (production path).
 */
export function checkSerenaHealthSafe(): Promise<CheckResult> {
  return checkSerenaHealthSafeWith(checkSerenaHealth)
}
