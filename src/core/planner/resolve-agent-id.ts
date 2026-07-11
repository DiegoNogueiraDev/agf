/*!
 * resolveAgentId — pure helper for agent identity resolution.
 * Task node_7f5de7d335de.
 *
 * WHY: Centralises the priority chain (CLI flag > env var > generated uuid)
 * so every command that needs an agentId calls one place. Pure — callers
 * supply the generator so there is no Date/crypto dependency here.
 *
 * Composes with: next-cmd.ts, claim-next-task.ts.
 */

/**
 * Resolve the agent ID for multi-agent mode.
 * Priority: flag > AGF_AGENT_ID env var > result of generateFn().
 */
export function resolveAgentId(flag: string | undefined, env: string | undefined, generateFn: () => string): string {
  return flag ?? env ?? generateFn()
}
