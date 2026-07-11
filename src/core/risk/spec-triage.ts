/*!
 * spec-triage — triage orphan spec-nodes: requirement, interface, contract.
 *
 * WHY: spec nodes (requirement, interface, contract) accumulate without consumers
 * or implementers; this module lists them and lets operators promote (create task +
 * implements edge) or close (archive). Mirrors risk-triage.ts for spec types.
 *
 * An orphan spec-node = has no inbound `implements` edge from any task/subtask.
 *
 * Composes with: risk-triage.ts (pattern source), sqlite-store.ts (mutations).
 */

import { randomUUID } from 'node:crypto'
import type { SqliteStore } from '../store/sqlite-store.js'

/** Node types considered spec-nodes subject to this triage. */
const SPEC_TYPES = new Set(['requirement', 'interface', 'contract'])

export interface SpecTriageOptions {
  dryRun: boolean
  promote?: string[]
  close?: string[]
}

export interface SpecOrphan {
  id: string
  type: string
  title: string
  applyVia: { promote: string; close: string }
}

export interface SpecTriageResult {
  orphans: SpecOrphan[]
  mutated: boolean
  promoted: string[]
  closed: string[]
}

/**
 * Triage orphan spec-nodes.
 * In dry-run mode (default), lists orphans only — zero mutations.
 */
export function triageSpecNodes(store: SqliteStore, opts: SpecTriageOptions): SpecTriageResult {
  const doc = store.toGraphDocument()

  // Find spec-nodes with no inbound implements edge
  const specNodes = doc.nodes.filter((n) => SPEC_TYPES.has(n.type) && n.status !== 'done')
  const implementedIds = new Set(doc.edges.filter((e) => e.relationType === 'implements').map((e) => e.to))

  const orphanNodes = specNodes.filter((n) => !implementedIds.has(n.id))

  const result: SpecTriageResult = {
    orphans: orphanNodes.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      applyVia: {
        promote: `agf spec triage --promote ${n.id} --commit`,
        close: `agf spec triage --close ${n.id} --commit`,
      },
    })),
    mutated: false,
    promoted: [],
    closed: [],
  }

  if (opts.dryRun) return result

  const now = new Date().toISOString()

  // ── Promote: create consuming task + implements edge ─────────────────────────
  for (const specId of opts.promote ?? []) {
    const spec = orphanNodes.find((n) => n.id === specId)
    if (!spec) continue

    const taskId = randomUUID()

    store.insertNode({
      id: taskId,
      type: 'task',
      status: 'backlog',
      title: `Implement: ${spec.title}`,
      priority: spec.priority ?? 3,
      blocked: false,
      acceptanceCriteria: [`Spec "${spec.title}" has a concrete implementation wired via this task.`],
      metadata: { promotedFromSpec: specId, specType: spec.type },
      createdAt: now,
      updatedAt: now,
    })

    store.insertEdge({
      id: randomUUID(),
      from: taskId,
      to: specId,
      relationType: 'implements',
      weight: 1,
      createdAt: now,
    })

    result.promoted.push(specId)
  }

  // ── Close: archive invalid/resolved spec-nodes ──────────────────────────────
  for (const specId of opts.close ?? []) {
    if (!orphanNodes.find((n) => n.id === specId)) continue
    store.updateNodeStatus(specId, 'done')
    result.closed.push(specId)
  }

  result.mutated = result.promoted.length > 0 || result.closed.length > 0

  return result
}
