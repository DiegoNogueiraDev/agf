/*!
 * risk-triage — triage open risk nodes: promote to task, accept, or close.
 *
 * WHY: risks accumulate in the graph from woodpecker/honesty stubs. This module
 * lets operators act on them in bulk without leaving them as permanent noise.
 *
 * Composes with: sqlite-store.ts (mutations), node-type-sets.ts (type filters).
 * Mirror of: gaps/gap-applier.ts (same dry-run / apply pattern).
 */

import { randomUUID } from 'node:crypto'
import type { SqliteStore } from '../store/sqlite-store.js'

export interface AcceptOptions {
  id: string
  reason: string
}

export interface TriageOptions {
  dryRun: boolean
  promote?: string[]
  accept?: AcceptOptions[]
  close?: string[]
}

export interface TriageResult {
  risks: Array<{ id: string; title: string }>
  mutated: boolean
  promoted: string[]
  accepted: string[]
  closed: string[]
}

/**
 * Triage open risk nodes.
 * In dry-run mode (default), only lists risks — zero mutations.
 */
export function triageRisks(store: SqliteStore, opts: TriageOptions): TriageResult {
  const doc = store.toGraphDocument()
  const risks = doc.nodes.filter((n) => n.type === 'risk' && n.status !== 'done')

  const result: TriageResult = {
    risks: risks.map((r) => ({ id: r.id, title: r.title })),
    mutated: false,
    promoted: [],
    accepted: [],
    closed: [],
  }

  if (opts.dryRun) return result

  // ── Promote: create child task + related_to edge + mark risk addressed ──────
  for (const riskId of opts.promote ?? []) {
    const risk = risks.find((r) => r.id === riskId)
    if (!risk) continue

    const taskId = randomUUID()
    const now = new Date().toISOString()

    store.insertNode({
      id: taskId,
      type: 'task',
      status: 'backlog',
      title: `Mitigate: ${risk.title}`,
      priority: risk.priority,
      blocked: false,
      acceptanceCriteria: [`Risk "${risk.title}" is mitigated or accepted with documented reason.`],
      metadata: { promotedFromRisk: riskId },
      createdAt: now,
      updatedAt: now,
    })

    store.insertEdge({
      id: randomUUID(),
      from: taskId,
      to: riskId,
      relationType: 'related_to',
      weight: 1,
      createdAt: now,
    })

    store.updateNode(riskId, { metadata: { ...risk.metadata, addressed: true } })
    result.promoted.push(riskId)
  }

  // ── Accept: set metadata accepted + reason ──────────────────────────────────
  for (const { id, reason } of opts.accept ?? []) {
    const risk = risks.find((r) => r.id === id)
    if (!risk) continue
    store.updateNode(id, { metadata: { ...risk.metadata, accepted: true, reason } })
    result.accepted.push(id)
  }

  // ── Close: archive (status → done) ─────────────────────────────────────────
  for (const id of opts.close ?? []) {
    if (!risks.find((r) => r.id === id)) continue
    store.updateNodeStatus(id, 'done')
    result.closed.push(id)
  }

  result.mutated = result.promoted.length > 0 || result.accepted.length > 0 || result.closed.length > 0

  return result
}
