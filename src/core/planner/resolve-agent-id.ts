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

/**
 * Identity for RELEASING a claim (done/submit) — flag > AGF_AGENT_ID env, and
 * deliberately NO uuid fallback (node_ca455c0520fc): a generated id could never
 * hold a lease, so releasing with it would always be a mismatch; no identity ⇒
 * no release attempt (byte-identical to the pre-parity behaviour). Blank env
 * reads as absent.
 */
export function resolveReleaseAgentId(flag: string | undefined, env: string | undefined): string | undefined {
  return flag ?? (env && env.trim().length > 0 ? env : undefined)
}
