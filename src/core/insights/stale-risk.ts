/*!
 * stale-risk — surface open risks that have not been triaged within N days.
 *
 * WHY: risks accumulate silently in the backlog. Without an age gate,
 * findings rot and never drive action. This pure function computes stale
 * risk counts for surfacing in `agf insights`.
 *
 * Pure (no IO). Caller queries the store and passes typed records.
 * Composes with: insights-cmd.ts (CLI surface).
 */

export interface RiskRecord {
  id: string
  title: string
  updatedAt: string
}

export interface StaleRiskOptions {
  /** Risks older than this many days (by updatedAt) are considered stale. Default: 14. */
  staleDays?: number
  /** Reference timestamp for age calculation. Default: Date.now(). */
  nowMs?: number
}

export interface StaleRiskEntry {
  id: string
  title: string
  ageDays: number
}

export interface StaleRiskResult {
  openCount: number
  staleCount: number
  staleRisks: StaleRiskEntry[]
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Compute stale risk statistics from a list of open risk records. */
export function computeStaleRisks(risks: RiskRecord[], opts: StaleRiskOptions = {}): StaleRiskResult {
  const threshold = opts.staleDays ?? 14
  const nowMs = opts.nowMs ?? Date.now()

  const staleRisks: StaleRiskEntry[] = []

  for (const r of risks) {
    const updatedMs = new Date(r.updatedAt).getTime()
    const ageDays = Math.floor((nowMs - updatedMs) / DAY_MS)
    if (ageDays > threshold) {
      staleRisks.push({ id: r.id, title: r.title, ageDays })
    }
  }

  return { openCount: risks.length, staleCount: staleRisks.length, staleRisks }
}

/**
 * Risk/blocker nodes with a resolved marker in the description but a status
 * still open are only caught by someone manually reading `agf insights
 * bottlenecks` — this surfaces them deterministically. A generic node shape
 * (not the DB row) so this composes with monitorGraph's in-memory pass.
 */
export interface ResolvableRiskNode {
  id: string
  type: string
  title: string
  status: string
  description?: string
}

const RESOLVED_MARKER_WORD = '(resolvido|done|fixed|wontfix|duplicate|n\\/a)'
/** The marker as the very first word (optionally followed by ":") reads as a status declaration, not prose. */
const LEADING_MARKER = new RegExp(`^\\s*${RESOLVED_MARKER_WORD}\\s*:?\\b`, 'i')
/** "Status: <marker>" (or "Status resolvido"/etc without a colon) anywhere in the text. */
const LABELED_MARKER = new RegExp(`\\bstatus\\s*:?\\s*${RESOLVED_MARKER_WORD}\\b`, 'i')
const OPEN_TYPES = new Set(['risk', 'blocker'])
const RESOLVED_STATUSES = new Set(['done', 'cancelled'])

/**
 * Detect risk/blocker nodes whose description reads as already resolved
 * (RESOLVIDO/done/fixed/wontfix/duplicate/n·a) but whose status has not
 * actually transitioned to done/cancelled — a bookkeeping gap, not a real
 * open risk.
 *
 * Requires the marker to read as an explicit status declaration — either
 * leading the text or after a "status:" label — not a bare word-boundary
 * match anywhere in free-form prose. A naive `\bdone\b` match anywhere in
 * the description flagged unrelated sentences like "done claims não
 * verificáveis" or "10 ou mais tasks done" (describing ANOTHER system) as
 * if the risk itself were resolved — a real false-positive rate found via
 * dogfood against this project's own graph (node_6d11e167c53d).
 */
export function detectResolvedRisks(nodes: ResolvableRiskNode[]): ResolvableRiskNode[] {
  return nodes.filter((n) => {
    if (!OPEN_TYPES.has(n.type) || RESOLVED_STATUSES.has(n.status)) return false
    const desc = n.description ?? ''
    return LEADING_MARKER.test(desc) || LABELED_MARKER.test(desc)
  })
}
