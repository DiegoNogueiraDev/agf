/*!
 * web-surface-parity — audit of CLI capabilities vs web view coverage.
 *
 * WHY: the web exposes only 5 views (economy/graph/progress/colony-health/dashboard)
 * against 94+ CLI commands. This deterministic map identifies which key capabilities
 * lack a web surface, sorted by usage priority, to guide future UI work.
 *
 * Pure, ~0 token, no I/O. Result orients what to prioritize — not a feature flag.
 *
 * Composes with: progress-server.ts (known web routes), web/views/ (surface list).
 */

export interface CapabilityGap {
  capability: string
  /** 1=highest priority, higher=lower priority */
  priority: number
  description: string
}

export interface WebParityReport {
  /** Capabilities already surfaced via a web view. */
  covered: string[]
  /** Key CLI capabilities without a corresponding web view, sorted by priority asc. */
  gaps: CapabilityGap[]
}

/** Known web surfaces (routes + views served by progress-server.ts). */
const COVERED: string[] = ['stats', 'graph', 'economy', 'progress', 'colony-health']

/**
 * Key CLI capabilities and their priority for web surfacing.
 * Priority 1 = most impactful to expose; higher = less critical.
 */
const KEY_CAPABILITIES: CapabilityGap[] = [
  { capability: 'harness', priority: 1, description: 'Quality score (8 dimensions) — most-read during build loops' },
  { capability: 'gaps', priority: 2, description: 'Completeness gaps (required/recommended) — drives spec triage' },
  { capability: 'insights', priority: 3, description: 'Flow metrics: cycle time, lead time, throughput, efficiency' },
  { capability: 'scan', priority: 4, description: 'Security / typecheck / harness findings surfaced in graph' },
  {
    capability: 'risk-triage',
    priority: 5,
    description: 'Orphan risk and spec-node triage (promote/close actions)',
  },
  { capability: 'check', priority: 6, description: 'Definition-of-Done per node — gate readiness view' },
  { capability: 'forecast', priority: 7, description: 'Monte Carlo delivery estimates' },
  { capability: 'loop', priority: 8, description: 'Loop execution log and status' },
  { capability: 'memory', priority: 9, description: 'Pheromone trail + memory store browser' },
  { capability: 'metrics', priority: 10, description: 'LLM call ledger and economy report' },
]

/**
 * Return the web parity report: covered capabilities and gaps sorted by priority.
 * Deterministic — pure function, no I/O.
 */
export function auditWebParity(): WebParityReport {
  const coveredSet = new Set(COVERED)
  const gaps = KEY_CAPABILITIES.filter((c) => !coveredSet.has(c.capability)).sort((a, b) => a.priority - b.priority)

  return { covered: [...COVERED], gaps }
}
