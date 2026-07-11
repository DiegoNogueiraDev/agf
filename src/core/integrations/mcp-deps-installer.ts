import { execFileSync } from 'node:child_process'

export type InstallStatus = 'installed' | 'already_available' | 'failed' | 'skipped'

export interface InstallResult {
  name: string
  status: InstallStatus
  message?: string
}

const MCP_DEPENDENCIES = ['npx', 'uvx', 'docker'] as const

/** Allowlist: only names that are pure identifiers (letters, digits, dash, underscore, dot). */
const SAFE_CMD_RE = /^[a-zA-Z0-9._-]+$/

/**
 * Check if a command is available, guarding against injection via allowlist.
 * Returns false immediately when the name contains metacharacters.
 */
export async function isCommandAvailableSafe(cmd: string): Promise<boolean> {
  if (!SAFE_CMD_RE.test(cmd)) return false
  try {
    execFileSync('which', [cmd], { stdio: 'pipe', timeout: 5000 })
    return true
  } catch {
    return false
  }
}

/** @deprecated Use isCommandAvailableSafe instead. */
export async function isCommandAvailable(cmd: string): Promise<boolean> {
  return isCommandAvailableSafe(cmd)
}

export async function installAllMcpDeps(_projectDir: string): Promise<InstallResult[]> {
  const results: InstallResult[] = []

  for (const dep of MCP_DEPENDENCIES) {
    const available = await isCommandAvailable(dep)
    results.push({
      name: dep,
      status: available ? 'already_available' : 'failed',
      message: available ? `${dep} found in PATH` : `${dep} not found in PATH`,
    })
  }

  return results
}
