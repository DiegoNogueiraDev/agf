/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-policy-engine-context-routing — Task 2.1: analyze(mode:"policy_observations")
 *
 * Pure deterministic analysis of policy_observations rows.
 * Reports divergence %, top-3 applied rules, preferred providers by policy.
 * costNote: raw data only — no invented USD numbers (AC2).
 */

import type Database from 'better-sqlite3'

export interface PolicyObsRuleEntry {
  rule: string
  count: number
  pct: number
}

export interface PolicyObsProviderEntry {
  provider: string
  count: number
  pct: number
}

export interface PolicyObservationsReport {
  windowDays: number
  totalObservations: number
  divergenceCount: number
  divergencePct: number
  topRules: PolicyObsRuleEntry[]
  preferredProviders: PolicyObsProviderEntry[]
  costNote: string
}

export interface PolicyObsOptions {
  windowDays: number
  projectId?: string
  topN?: number
}

interface ObsRow {
  divergence: number
  decision: string
}

export function analyzePolicyObservations(db: Database.Database, opts: PolicyObsOptions): PolicyObservationsReport {
  const { windowDays, projectId, topN = 3 } = opts
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60_000).toISOString()

  const query = projectId
    ? db.prepare(
        'SELECT divergence, decision FROM policy_observations WHERE project_id = ? AND timestamp >= ? ORDER BY timestamp DESC',
      )
    : db.prepare('SELECT divergence, decision FROM policy_observations WHERE timestamp >= ? ORDER BY timestamp DESC')

  const rows: ObsRow[] = projectId ? (query.all(projectId, since) as ObsRow[]) : (query.all(since) as ObsRow[])

  const total = rows.length
  if (total === 0) {
    return {
      windowDays,
      totalObservations: 0,
      divergenceCount: 0,
      divergencePct: 0,
      topRules: [],
      preferredProviders: [],
      costNote: 'No observations in the requested window. No cost data available.',
    }
  }

  let divergenceCount = 0
  const ruleCounts: Record<string, number> = {}
  const providerCounts: Record<string, number> = {}

  for (const row of rows) {
    if (row.divergence === 1) divergenceCount++

    const decision = JSON.parse(row.decision) as {
      appliedRule: string
      chain: string[]
    }
    const rule = decision.appliedRule ?? 'unknown'
    ruleCounts[rule] = (ruleCounts[rule] ?? 0) + 1

    const preferred = decision.chain?.[0] ?? 'unknown'
    providerCounts[preferred] = (providerCounts[preferred] ?? 0) + 1
  }

  const topRules: PolicyObsRuleEntry[] = Object.entries(ruleCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([rule, count]) => ({ rule, count, pct: Math.round((count / total) * 100 * 100) / 100 }))

  const preferredProviders: PolicyObsProviderEntry[] = Object.entries(providerCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([provider, count]) => ({ provider, count, pct: Math.round((count / total) * 100 * 100) / 100 }))

  const divergencePct = Math.round((divergenceCount / total) * 100 * 100) / 100

  const costNote =
    `${divergenceCount} of ${total} observations diverged from policy decision. ` +
    `Policy preferred ${preferredProviders[0]?.provider ?? 'unknown'} in most cases. ` +
    `Correlate with llm_call_ledger (cost_usd column) by timestamp for exact USD impact.`

  return {
    windowDays,
    totalObservations: total,
    divergenceCount,
    divergencePct,
    topRules,
    preferredProviders,
    costNote,
  }
}
