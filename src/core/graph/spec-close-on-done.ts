/*!
 * spec-close-on-done — give spec nodes a terminal lifecycle so they stop
 * inflating the backlog forever.
 *
 * WHY: spec nodes (acceptance_criteria, contract, requirement, interface,
 * constraint, decision, formula, performance_budget) have no work-lifecycle of
 * their own — they describe what a task must satisfy. Left in `backlog` they
 * pollute every backlog/gaps/ready metric (in one real project: 885 of 1441
 * "backlog" nodes were just satisfied specs). They must close when the work that
 * satisfies them is done. Two relationships satisfy a spec:
 *   1. an `implements` edge (task → implements → spec): close when ALL implementers done
 *   2. a `parent_id` link (spec is a child of the task/epic it scopes): close when the parent is done
 *
 * Closing is to `satisfied` (additive status_flow, terminal). Idempotent.
 * Composes with: graph-types.ts (NodeStatus + RelationType), sqlite-store.ts.
 * Called by: done-cmd.ts (after a node transitions to `done`) and the backfill below.
 */

import type { SqliteStore } from '../store/sqlite-store.js'

/** Spec types satisfied by `implements` edges — close when ALL implementers are done. */
const IMPLEMENTS_CLOSEABLE = new Set(['contract', 'requirement', 'interface', 'performance_budget'])

/** Spec types scoped to a parent (AC of a task, constraint/decision of an epic) — close when the parent is done. */
const PARENT_CLOSEABLE = new Set(['acceptance_criteria', 'constraint', 'decision', 'formula'])

export interface SpecCloseResult {
  /** IDs of spec nodes that were transitioned to satisfied. */
  closed: string[]
}

/**
 * After `doneTaskId` transitions to `done`, close every spec it satisfies:
 * implements-edge specs (when all implementers are done) and parent-scoped
 * specs (whose parent is this task). Idempotent: already-satisfied nodes skip.
 */
export function closeSpecOnImplementerDone(store: SqliteStore, doneTaskId: string): SpecCloseResult {
  const doc = store.toGraphDocument()
  const statusById = new Map(doc.nodes.map((n) => [n.id, n.status]))
  const closed: string[] = []

  // (A) implements-edge specs: close when ALL implementers are done.
  const implementedSpecIds = doc.edges
    .filter((e) => e.relationType === 'implements' && e.from === doneTaskId)
    .map((e) => e.to)

  for (const specId of implementedSpecIds) {
    const spec = doc.nodes.find((n) => n.id === specId)
    if (!spec || !IMPLEMENTS_CLOSEABLE.has(spec.type) || spec.status === 'satisfied') continue

    const implementerIds = doc.edges
      .filter((e) => e.relationType === 'implements' && e.to === specId)
      .map((e) => e.from)
    if (implementerIds.length === 0) continue // no implementers — don't auto-close

    const allDone = implementerIds.every((id) => statusById.get(id) === 'done')
    if (allDone) {
      store.updateNodeStatus(specId, 'satisfied')
      closed.push(specId)
    }
  }

  // (B) parent-scoped specs: the parent (this done task) satisfies them.
  for (const spec of doc.nodes) {
    if (spec.parentId !== doneTaskId) continue
    if (!PARENT_CLOSEABLE.has(spec.type) || spec.status === 'satisfied') continue
    store.updateNodeStatus(spec.id, 'satisfied')
    closed.push(spec.id)
  }

  return { closed }
}

/**
 * One-shot reconciliation for graphs that predate (or drifted from) the
 * close-on-done rule: satisfy every backlog spec whose parent is done or whose
 * implementers are all done. Pure single-pass; idempotent. Use to drain legacy
 * spec-node pollution. Returns the closed ids.
 */
export function backfillSatisfiedSpecs(store: SqliteStore): SpecCloseResult {
  const doc = store.toGraphDocument()
  const statusById = new Map(doc.nodes.map((n) => [n.id, n.status]))
  const implementersBySpec = new Map<string, string[]>()
  for (const e of doc.edges) {
    if (e.relationType !== 'implements') continue
    const list = implementersBySpec.get(e.to) ?? []
    list.push(e.from)
    implementersBySpec.set(e.to, list)
  }

  const closed: string[] = []
  for (const spec of doc.nodes) {
    if (spec.status !== 'backlog') continue

    if (PARENT_CLOSEABLE.has(spec.type)) {
      if (spec.parentId && statusById.get(spec.parentId) === 'done') {
        store.updateNodeStatus(spec.id, 'satisfied')
        closed.push(spec.id)
      }
      continue
    }

    if (IMPLEMENTS_CLOSEABLE.has(spec.type)) {
      const impls = implementersBySpec.get(spec.id) ?? []
      if (impls.length > 0 && impls.every((id) => statusById.get(id) === 'done')) {
        store.updateNodeStatus(spec.id, 'satisfied')
        closed.push(spec.id)
      }
    }
  }
  return { closed }
}
