/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Topological Context Dilution — applies the flow decay `e^{-λ·d}` to a node's
 * neighbourhood, with a hard floor that protects semantic invariants.
 *
 * This is the corrected "transient hypofrontality": when λ is high (deep flow)
 * the *peripheral, episodic* neighbours are pruned, but constraints, risks,
 * decisions, acceptance criteria, unresolved blockers and unmet dependencies
 * are **pinned** — never diluted, regardless of λ or distance. Distant pinned
 * invariants are additionally pulled in via a bounded BFS (the "prefrontal
 * cortex" that keeps the architecture in scope even under flow).
 *
 * Reuses {@link buildTaskContext} for the 1-hop neighbourhood; this module only
 * decays and floors it. Deterministic, no side effects.
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import type { GraphNode, GraphEdge } from '../graph/graph-types.js'
import { buildTaskContext, type TaskContext } from './compact-context.js'
import { decayWeight } from './flow-index.js'
import { estimateTokens } from './token-estimator.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'topological-decay.ts' })

// ── Constants ────────────────────────────────────────────

/**
 * Node types whose information is structural/invariant and must never decay.
 * Dropping these is what turns "flow" into "amnesia" — so we don't.
 */
export const DEFAULT_PINNED_TYPES: readonly string[] = [
  'constraint',
  'risk',
  'decision',
  'acceptance_criteria',
  'constitution',
  'requirement',
]

/**
 * Related/implements/derived/edge neighbours are *peripheral* — treated at
 * semantic distance 2 so they decay before core structural neighbours (parent/
 * children at distance 1, which are kept as cheap structure).
 */
const PERIPHERAL_DISTANCE = 2

// ── Types ────────────────────────────────────────────────

export interface DecayOptions {
  /** λ_flow — the dynamic decay rate from {@link computeLambdaFlow}. */
  lambda: number
  /** Max BFS depth when pulling distant pinned invariants. */
  maxDepth: number
  /** Drop a peripheral neighbour when its weight falls below this (unless pinned). */
  weightThreshold: number
  /** Node types that are never diluted. Defaults to {@link DEFAULT_PINNED_TYPES}. */
  pinnedTypes?: ReadonlySet<string>
}

export interface PinnedInvariant {
  id: string
  type: string
  title: string
  status: string
  /** Topological distance from the focus node. */
  distance: number
}

export interface FlowContextMeta {
  lambda: number
  /** Peripheral neighbours dropped by decay. */
  prunedCount: number
  /** Neighbours retained (after pruning). */
  retainedCount: number
  /** Distant invariants pulled in via BFS. */
  pinnedCount: number
  tokensBaseline: number
  tokensActual: number
  /** Positive = saved; negative = pinned floor cost more than pruning saved (honest). */
  tokensSaved: number
  pinnedInvariants: PinnedInvariant[]
}

export interface DecayedContext {
  context: TaskContext
  meta: FlowContextMeta
}

// ── Helpers ──────────────────────────────────────────────

/** Estimate tokens of the payload that actually ships (no metrics, no alias). */
function corePayloadTokens(ctx: TaskContext, pinned: PinnedInvariant[]): number {
  const { metrics: _m, node: _n, ...core } = ctx
  return estimateTokens(JSON.stringify(pinned.length > 0 ? { ...core, pinnedInvariants: pinned } : core))
}

function isPinnedType(type: string, pinnedTypes: ReadonlySet<string>): boolean {
  return pinnedTypes.has(type)
}

/**
 * BFS the graph (undirected over edges) up to `maxDepth`, collecting nodes whose
 * type is pinned and that are not already part of the 1-hop context.
 */
function collectDistantInvariants(
  store: SqliteStore,
  rootId: string,
  alreadyPresent: ReadonlySet<string>,
  maxDepth: number,
  pinnedTypes: ReadonlySet<string>,
): PinnedInvariant[] {
  if (maxDepth <= 0) return []

  const visited = new Set<string>([rootId])
  const found = new Map<string, PinnedInvariant>()
  let frontier: string[] = [rootId]

  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth += 1) {
    const next: string[] = []
    for (const id of frontier) {
      const edges: GraphEdge[] = [...store.getEdgesFrom(id), ...store.getEdgesTo(id)]
      for (const edge of edges) {
        const neighborId = edge.from === id ? edge.to : edge.from
        if (visited.has(neighborId)) continue
        visited.add(neighborId)
        next.push(neighborId)

        if (alreadyPresent.has(neighborId) || found.has(neighborId)) continue
        const neighbor: GraphNode | null = store.getNodeById(neighborId)
        if (neighbor && isPinnedType(neighbor.type, pinnedTypes)) {
          found.set(neighborId, {
            id: neighbor.id,
            type: neighbor.type,
            title: neighbor.title,
            status: neighbor.status,
            distance: depth,
          })
        }
      }
    }
    frontier = next
  }

  return [...found.values()]
}

// ── Main ─────────────────────────────────────────────────

/**
 * Build a flow-decayed task context: prune peripheral neighbours by `e^{-λ·d}`
 * while pinning invariants, and pull distant invariants in via BFS.
 *
 * Returns `null` when the focus node does not exist (mirrors buildTaskContext).
 */
export function buildDecayedTaskContext(store: SqliteStore, nodeId: string, opts: DecayOptions): DecayedContext | null {
  const base = buildTaskContext(store, nodeId)
  if (!base) return null

  const pinnedTypes = opts.pinnedTypes ?? new Set(DEFAULT_PINNED_TYPES)
  const tokensBaseline = corePayloadTokens(base, [])

  const peripheralWeight = decayWeight(opts.lambda, PERIPHERAL_DISTANCE)
  const peripheralSurvives = peripheralWeight >= opts.weightThreshold

  // Track every id present in the 1-hop context (to dedupe BFS invariants).
  const presentIds = new Set<string>([base.task.id])
  if (base.parent) presentIds.add(base.parent.id)
  for (const c of base.children) presentIds.add(c.id)
  for (const b of base.blockers) presentIds.add(b.id)
  for (const d of base.dependsOn) presentIds.add(d.id)

  const ctx = structuredClone(base) as TaskContext
  let prunedCount = 0

  /** Prune a peripheral list: keep pinned-type items; drop the rest when decayed. */
  const prunePeripheral = <T extends { id: string; type: string }>(list: T[] | undefined): T[] | undefined => {
    if (!list) return list
    const kept = list.filter((item) => {
      presentIds.add(item.id)
      if (isPinnedType(item.type, pinnedTypes)) return true
      if (peripheralSurvives) return true
      prunedCount += 1
      return false
    })
    return kept.length > 0 ? kept : undefined
  }

  ctx.relatedNodes = prunePeripheral(ctx.relatedNodes)
  ctx.implementsNodes = prunePeripheral(ctx.implementsNodes)
  ctx.derivedFromNodes = prunePeripheral(ctx.derivedFromNodes)
  ctx.edgeChildren = prunePeripheral(ctx.edgeChildren)
  // edgeParent is a single peripheral ref; pin-or-drop by the same rule.
  if (ctx.edgeParent) {
    presentIds.add(ctx.edgeParent.id)
    if (!isPinnedType(ctx.edgeParent.type, pinnedTypes) && !peripheralSurvives) {
      ctx.edgeParent = null
      prunedCount += 1
    }
  }

  // Pull distant invariants (constraints/risks/decisions/AC/...) so the
  // architecture is never lost — even at peak flow.
  const pinnedInvariants = collectDistantInvariants(store, nodeId, presentIds, opts.maxDepth, pinnedTypes)

  // Recompute the shipped-token estimate and refresh metrics.
  const tokensActual = corePayloadTokens(ctx, pinnedInvariants)
  ctx.metrics = {
    ...ctx.metrics,
    estimatedTokens: tokensActual,
  }
  ctx.node = ctx.task

  const retainedCount =
    (ctx.children?.length ?? 0) +
    (ctx.blockers?.length ?? 0) +
    (ctx.dependsOn?.length ?? 0) +
    (ctx.relatedNodes?.length ?? 0) +
    (ctx.implementsNodes?.length ?? 0) +
    (ctx.derivedFromNodes?.length ?? 0) +
    (ctx.edgeChildren?.length ?? 0)

  log.debug('flow:decay', {
    nodeId,
    lambda: opts.lambda,
    prunedCount,
    pinnedCount: pinnedInvariants.length,
    tokensBaseline,
    tokensActual,
  })

  return {
    context: ctx,
    meta: {
      lambda: opts.lambda,
      prunedCount,
      retainedCount,
      pinnedCount: pinnedInvariants.length,
      tokensBaseline,
      tokensActual,
      tokensSaved: tokensBaseline - tokensActual,
      pinnedInvariants,
    },
  }
}
