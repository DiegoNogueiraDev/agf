/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * RealTaskLifecycleService — production task lifecycle backed by SqliteStore.
 * Implements TaskLifecycleService contract. Single authority for start/finish/
 * status/findNext across TUI, CLI, and bridge consumers.
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import type { TaskLifecycleService, DoDReport, DoDCheck, TaskContext } from '../contracts/task-lifecycle.js'
import type { GraphNode, NodeStatus } from '../graph/graph-types.js'
import { applyFlowToCompact } from '../context/flow-compact.js'
import { buildTaskContext, summarizeTaskContext } from '../context/compact-context.js'
import { emitTaskHookSync } from '../hooks/hook-runtime.js'
import { computeTaskSignature } from '../reuse/task-signature.js'
import { resolveReuse } from '../reuse/resolve-reuse.js'
import { recordArtifact } from '../reuse/artifact-cache.js'
import { generateId } from '../utils/id.js'
import { checkEpicPromotionGate, checkEpicHarnessGate, readLastHarnessScore } from '../utils/epic-promotion-gate.js'
import { createLogger } from '../utils/logger.js'
import { TaskPrefetcher, type PrefetchedContext } from '../planner/task-prefetcher.js'
import { prefetchNextContext, invalidatePrefetchCache } from '../planner/prefetch-next-context.js'

const PREFETCH_TTL_MS = 5 * 60_000

const log = createLogger({ layer: 'core', source: 'task-lifecycle.ts' })

export class RealTaskLifecycleService implements TaskLifecycleService {
  private readonly prefetcher = new TaskPrefetcher({ ttlMs: PREFETCH_TTL_MS })

  constructor(private readonly store: SqliteStore) {}

  // ── TaskLifecycleService ──────────────────────────────

  /**
   * Read the context pre-computed by the previous finishTask's predicted-next
   * prefetch (§node_wire_a97c276bb049). Null on a cache miss/expiry/never-prefetched.
   */
  getPrefetchedContext(nodeId: string): PrefetchedContext | null {
    return this.prefetcher.get(nodeId)
  }

  startTask(nodeId?: string): TaskContext | null {
    const node = nodeId ? this.store.getNodeById(nodeId) : this.findNextInternal()
    if (!node) return null

    // The caller asked for a specific node — if it isn't the one we predicted
    // and prefetched, the prediction was wrong; drop the stale cache entry.
    if (nodeId) {
      this.prefetcher.invalidateIfMismatch(nodeId)
      invalidatePrefetchCache(this.store, nodeId)
    }

    // Hook: task entering execution (anti-hallucination, WIP guard, audit).
    // Emitido ANTES de marcar in_progress para o WIP guard contar corretamente.
    emitTaskHookSync(this.store, 'task:pre-execute', {
      nodeId: node.id,
      title: node.title,
      taskKind: node.type,
    })

    this.store.updateNodeStatus(node.id, 'in_progress')

    // §node_wire_cc4c4c7e02e2 — prefetch do contexto+brief da próxima task
    // enquanto a atual está em execução. Best-effort: nunca quebra startTask.
    try {
      prefetchNextContext(this.store)
    } catch {
      // Prefetch is an optimization, not a correctness requirement.
    }

    // Build context. Flow dilution is applied by the caller or downstream;
    // this service returns raw context — applyFlowToCompact is the policy layer.
    const updated = this.store.getNodeById(node.id) ?? node
    const children = this.store.getChildNodes(node.id)
    const blockers = this.getBlockers(node.id)
    const deps = this.getDependencies(node.id)

    // Query artifact cache for reuse hints
    let reuseHint: TaskContext['reuseHint']
    try {
      const signature = computeTaskSignature({
        title: updated.title,
        acceptanceCriteria: updated.acceptanceCriteria,
        type: updated.type,
        tags: updated.tags,
      })
      const decision = resolveReuse(this.store.getDb(), signature)
      if (decision.kind === 'exact') {
        reuseHint = { edits: decision.edits, sourceId: decision.sourceId }
      }
    } catch {
      // Cache failure never blocks task start
    }

    return {
      node: updated,
      acceptanceCriteria: updated.acceptanceCriteria ?? [],
      children,
      blockers,
      dependsOn: deps.map((d) => ({
        nodeId: d.id,
        title: d.title,
        status: d.status,
        resolved: d.status === 'done',
      })),
      reuseHint,
    }
  }

  finishTask(nodeId: string, rationale?: string, testFiles?: string[]): DoDReport {
    const node = this.store.getNodeById(nodeId)
    if (!node) {
      return this.failReport(nodeId, `Node "${nodeId}" not found`)
    }

    // Hook: pré-DoD — antes de avaliar o Definition of Done (canal task:pre-done, store-bus).
    emitTaskHookSync(this.store, 'task:pre-done', { nodeId, title: node.title })

    const checks = this.runDoDChecks(node, testFiles)
    const requiredPassed = checks.filter((c) => c.severity === 'required').every((c) => c.passed)
    const passed = checks.filter((c) => c.passed).length

    if (!requiredPassed) {
      // Hook: failed gate → learning records an outcome=failure signal.
      emitTaskHookSync(this.store, 'task:error', {
        nodeId,
        title: node.title,
        error: 'DoD not ready',
        failedChecks: checks.filter((c) => c.severity === 'required' && !c.passed).map((c) => c.name),
      })
      return { nodeId, title: node.title, checks, passed, total: checks.length, ready: false }
    }

    this.store.updateNodeStatus(nodeId, 'done')

    // Hook: task completed → learning persists a success PerfRecord.
    emitTaskHookSync(this.store, 'task:post-complete', {
      nodeId,
      title: node.title,
      passed,
      total: checks.length,
    })

    // §node_wire_a97c276bb049 — predictive prefetch: warm the cache for the
    // task findNext() will hand out next, so a same-process startTask() call
    // serves it without recomputing. Best-effort: never breaks finishTask.
    try {
      const predicted = this.findNextInternal()
      if (predicted) {
        const ctx = buildTaskContext(this.store, predicted.id)
        if (ctx) {
          this.prefetcher.prefetch(predicted.id, {
            query: predicted.title,
            context: summarizeTaskContext(ctx),
          })
        }
      }
    } catch {
      // Prefetching is an optimization, not a correctness requirement.
    }

    // Record artifact in cache for future reuse
    try {
      const signature = computeTaskSignature({
        title: node.title,
        acceptanceCriteria: node.acceptanceCriteria,
        type: node.type,
        tags: node.tags,
      })
      recordArtifact(this.store.getDb(), {
        id: generateId('art'),
        signature,
        nodeId: node.id,
        appliedEdits: [],
        outcome: 'success',
        createdAt: Date.now(),
      })
    } catch {
      // Cache write never breaks finish task
    }

    let epicPromotion: DoDReport['epicPromotion'] | undefined
    if (node.parentId) {
      const siblings = this.store.getChildNodes(node.parentId)
      const allDone = siblings.every((s) => s.status === 'done' || s.id === nodeId)
      if (allDone && siblings.length > 0) {
        const parent = this.store.getNodeById(node.parentId)
        // node_wire_3a6f7a16d128 — epic-promotion-gate wire. allChildrenDone
        // only checks status; a child can be 'done' with hidden required
        // gaps (no AC, unresolved blocker). Surface that debt here instead
        // of silently reporting the epic as promotable.
        const gate = checkEpicPromotionGate(this.store.toGraphDocument(), node.parentId)
        // node_aff3a524791d — harness ≥70 gate: recusa a promoção quando o último
        // score de harness cai abaixo do corte (cold start só avisa). NÃO reverte
        // o done da task em si — apenas o SINAL de promoção do épico é bloqueado.
        const harnessGate = checkEpicHarnessGate(readLastHarnessScore(this.store.getDb()))
        epicPromotion = {
          parentId: node.parentId,
          parentTitle: parent?.title ?? 'unknown',
          allChildrenDone: true,
          blocked: gate.blocked || harnessGate.blocked,
          requiredGapCount: gate.requiredGapCount,
          harnessScore: harnessGate.score,
          harnessCode: harnessGate.code,
        }
      }
    }

    return {
      nodeId,
      title: node.title,
      checks,
      passed,
      total: checks.length,
      ready: true,
      epicPromotion,
    }
  }

  updateStatus(nodeId: string, status: NodeStatus, options?: { skipHooks?: boolean }): GraphNode | null {
    if (options?.skipHooks) {
      log.warn('status:force-bypass', { nodeId, to: status })
    }
    return this.store.updateNodeStatus(nodeId, status, { skipHooks: options?.skipHooks })
  }

  findNext(): GraphNode | null {
    return this.findNextInternal()
  }

  // ── internals ─────────────────────────────────────────

  private findNextInternal(): GraphNode | null {
    const backlog = this.store.getNodesByStatus('backlog')
    const tasks = backlog.filter((n) => n.type === 'task' || n.type === 'subtask')
    tasks.sort((a, b) => a.priority - b.priority)
    return tasks[0] ?? null
  }

  private getBlockers(nodeId: string): GraphNode[] {
    const blocked: GraphNode[] = []
    const edges = this.store.getEdgesTo(nodeId)
    for (const edge of edges) {
      if (edge.relationType === 'blocks') {
        const blocker = this.store.getNodeById(edge.from)
        if (blocker) blocked.push(blocker)
      }
    }
    return blocked
  }

  private getDependencies(nodeId: string): GraphNode[] {
    const deps: GraphNode[] = []
    const edges = this.store.getEdgesFrom(nodeId)
    for (const edge of edges) {
      if (edge.relationType === 'depends_on') {
        const dep = this.store.getNodeById(edge.to)
        if (dep) deps.push(dep)
      }
    }
    return deps
  }

  private runDoDChecks(node: GraphNode, testFiles?: string[]): DoDCheck[] {
    return [
      {
        name: 'has_acceptance_criteria',
        severity: 'required',
        passed: (node.acceptanceCriteria?.length ?? 0) > 0,
        detail: `${node.acceptanceCriteria?.length ?? 0} AC items`,
      },
      {
        name: 'ac_quality_pass',
        severity: 'required',
        passed: (node.acceptanceCriteria?.length ?? 0) > 0,
        detail: (node.acceptanceCriteria?.length ?? 0) > 0 ? 'AC check passed' : 'No AC defined',
      },
      {
        name: 'no_unresolved_blockers',
        severity: 'required',
        passed: node.status !== 'blocked',
        detail: node.status === 'blocked' ? 'Node is blocked' : 'No blockers',
      },
      {
        name: 'status_flow_valid',
        severity: 'required',
        passed: node.status === 'in_progress' || node.status === 'backlog',
        detail: `Current status: ${node.status}`,
      },
      {
        name: 'has_description',
        severity: 'recommended',
        passed: (node.description?.length ?? 0) > 0,
        detail: node.description ? 'Description present' : 'No description',
      },
      {
        name: 'not_oversized',
        severity: 'recommended',
        passed: node.xpSize !== 'L' && node.xpSize !== 'XL',
        detail: `Size: ${node.xpSize ?? 'not set'}`,
      },
      {
        name: 'has_testable_ac',
        severity: 'recommended',
        passed: (node.acceptanceCriteria?.length ?? 0) > 0,
        detail: (node.acceptanceCriteria?.length ?? 0) > 0 ? 'AC present' : 'No testable AC',
      },
      {
        name: 'has_test_files',
        severity: 'recommended',
        passed: (testFiles?.length ?? 0) > 0,
        detail: testFiles ? `${testFiles.length} files` : 'No test files provided',
      },
    ]
  }

  private failReport(nodeId: string, detail: string): DoDReport {
    return {
      nodeId,
      title: 'unknown',
      checks: [
        { name: 'has_acceptance_criteria', severity: 'required', passed: false, detail },
        { name: 'ac_quality_pass', severity: 'required', passed: false, detail },
        { name: 'no_unresolved_blockers', severity: 'required', passed: false, detail },
        { name: 'status_flow_valid', severity: 'required', passed: false, detail },
      ],
      passed: 0,
      total: 4,
      ready: false,
    }
  }
}

/**
 * Create a flow-diluted task context by wrapping {@link RealTaskLifecycleService.startTask}
 * through {@link applyFlowToCompact}.
 *
 * This function is the recommended entry point for all consumers
 * (TUI, CLI, bridge) to get flow-governed context.
 */
export function startTaskWithFlow(store: SqliteStore, nodeId?: string): TaskContext | null {
  const service = new RealTaskLifecycleService(store)
  const raw = service.startTask(nodeId)
  if (!raw) return null

  // Apply flow dilution if enabled; fall through to raw if disabled
  const flowResult = applyFlowToCompact(store, raw.node.id)
  if (flowResult) {
    return {
      ...raw,
      // Flow-compacted context replaces raw children with decayed neighbourhood
      children: flowResult.context.children.map(
        (c) =>
          ({
            ...c,
            createdAt: '',
            updatedAt: '',
          }) as GraphNode,
      ),
      // Pinned invariants from flow are added as blockers for visibility
      blockers: [
        ...raw.blockers,
        ...flowResult.pinnedInvariants.map(
          (inv) =>
            ({
              id: `pinned-${inv.type}`,
              type: inv.type as GraphNode['type'],
              title: inv.title,
              status: 'backlog' as NodeStatus,
              priority: 1 as const,
              description: 'Pinned invariant — never diluted by flow',
              createdAt: '',
              updatedAt: '',
            }) as GraphNode,
        ),
      ],
    }
  }

  return raw
}
