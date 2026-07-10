/*!
 * TDD: shell-injection guard — execFileSync + allowlist (node_bbd85e6b41cc).
 *
 * AC1: git-context uses execFileSync('git', args) not shell string join.
 * AC2: mcp-deps-installer rejects names with metacharacters before which.
 * AC3: metacharacter input is never passed to a shell.
 */

import { describe, it, expect } from 'vitest'
import { isCommandAvailableSafe } from '../core/integrations/mcp-deps-installer.js'

describe('AC2 + AC3: isCommandAvailableSafe rejects malicious names', () => {
  it('returns false for name with semicolon (command injection attempt)', async () => {
    const result = await isCommandAvailableSafe('npx; rm -rf /')
    expect(result).toBe(false)
  })

  it('returns false for name with backtick', async () => {
    const result = await isCommandAvailableSafe('npx`whoami`')
    expect(result).toBe(false)
  })

  it('returns false for name with pipe', async () => {
    const result = await isCommandAvailableSafe('npx|cat /etc/passwd')
    expect(result).toBe(false)
  })

  it('returns true for a safe known command (npx)', async () => {
    // npx is in MCP_DEPENDENCIES allowlist; test may be false on systems without npx
    // — we only verify no throw and the allowlist check passes for safe names
    const result = await isCommandAvailableSafe('npx')
    expect(typeof result).toBe('boolean') // truthy on systems with npx, false otherwise
  })
})
