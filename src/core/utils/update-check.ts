/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Decide whether to phone home to the npm registry for an update check.
 *
 * Local-first contract (ADR-0057): the update check is the only
 * network call mcp-graph makes by default. Users who want a strictly
 * offline run set `MCP_GRAPH_NO_UPDATE_CHECK=1`. CI runs are also
 * skipped — they are non-interactive and the banner would be noise.
 */

export function shouldCheckForUpdates(env: NodeJS.ProcessEnv): boolean {
  const optOut = env.MCP_GRAPH_NO_UPDATE_CHECK?.toLowerCase()
  if (optOut === '1' || optOut === 'true') {
    return false
  }
  if (env.CI === 'true') {
    return false
  }
  return true
}
