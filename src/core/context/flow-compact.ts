/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Flow Compact — orchestrates the transient-hypofrontality pipeline for the
 * `context(action:"compact")` MCP tool. Keeps the tool thin: resolve config →
 * compute Φ from recent outcomes → λ_flow → decay or baseline (A/B) → record
 * telemetry → return an augmented compact context.
 *
 * Returns `null` when flow is disabled or the node does not exist, so the caller
 * falls through to the exact legacy behaviour (non-regression contract).
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import { resolveFlowConfig, flowAbArm } from './flow-config.js'
import { computeFlowIndex, computeLambdaFlow } from './flow-index.js'
import { buildDecayedTaskContext } from './topological-decay.js'
import { buildTaskContext, type TaskContext } from './compact-context.js'
import { acceptTextCompression } from '../economy/info-bottleneck.js'
import { resolveInfoBottleneckGate, taskPredictiveText } from './info-bottleneck-gate.js'
import { estimateTokens } from './token-estimator.js'
import { buildXmlCompactOutput, type XmlCompactFields } from './compact-template.js'
import { queryEpisodicOutcomes } from '../store/episodic-outcomes-store.js'
import { insertFlowMetric, type FlowMode } from './flow-metrics-store.js'
import type { PinnedInvariant } from './topological-decay.js'
import { generateId } from '../utils/id.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'flow-compact.ts' })

export interface FlowBlock {
  enabled: true
  mode: FlowMode
  /** Φ(t) ∈ [0,1]. */
  phi: number
  /** Consecutive recent successes. */
  streak: number
  /** λ_flow = λ_base + (α · Φ). */
  lambda: number
  prunedCount: number
  pinnedCount: number
  tokensBaseline: number
  tokensActual: number
  tokensSaved: number
}

export interface FlowCompactResult {
  context: TaskContext
  pinnedInvariants: PinnedInvariant[]
  flow: FlowBlock
}

/**
 * Render a {@link FlowCompactResult} into a compact, token-light prompt block.
 * Pure — used by the live implement hook to inject decayed graph context next
 * to the repo-map. Pinned invariants (constraints/risks/decisions/AC) are kept
 * verbatim; peripheral neighbours already pruned by the decay step.
 */
export function formatFlowContext(result: FlowCompactResult): string {
  const { context: ctx, pinnedInvariants } = result
  const lines: string[] = ['Contexto do grafo (diluído por flow — Φ governando o esquecimento):']

  lines.push(`- Task: ${ctx.task.title} (${ctx.task.id}) [${ctx.task.status}]`)
  if (ctx.task.description) lines.push(`  ${ctx.task.description}`)

  if (ctx.acceptanceCriteria.length > 0) {
    lines.push('- Critérios de aceitação:')
    for (const ac of ctx.acceptanceCriteria) lines.push(`  • ${ac}`)
  }

  const openBlockers = ctx.blockers.filter((b) => b.status !== 'done')
  if (openBlockers.length > 0) {
    lines.push(`- Bloqueadores: ${openBlockers.map((b) => `${b.title} (${b.status})`).join('; ')}`)
  }

  const openDeps = ctx.dependsOn.filter((d) => !d.resolved)
  if (openDeps.length > 0) {
    lines.push(`- Depende de: ${openDeps.map((d) => `${d.title} (${d.status})`).join('; ')}`)
  }

  if (pinnedInvariants.length > 0) {
    lines.push('- Invariantes pinados (nunca diluídos):')
    for (const inv of pinnedInvariants) lines.push(`  • [${inv.type}] ${inv.title}`)
  }

  return lines.join('\n')
}

/** Record telemetry; never let a telemetry failure break the context hot path. */
function recordMetric(
  store: SqliteStore,
  row: Omit<Parameters<typeof insertFlowMetric>[1], 'id' | 'createdAt'> & { createdAt?: number },
): void {
  try {
    insertFlowMetric(store.getDb(), {
      id: generateId('flowm'),
      createdAt: row.createdAt ?? Date.now(),
      ...row,
    })
  } catch (err) {
    log.warn('flow:metric:record-failed', { error: err instanceof Error ? err.message : String(err) })
  }
}

/**
 * Apply flow dilution to a compact context request.
 * @returns the augmented context, or `null` to signal "fall through to legacy".
 */
export function applyFlowToCompact(store: SqliteStore, nodeId: string): FlowCompactResult | null {
  const cfg = resolveFlowConfig(store)
  if (!cfg.enabled) return null

  const projectId = store.getActiveProject()?.id ?? 'unknown'
  const outcomes = queryEpisodicOutcomes(store.getDb(), { limit: cfg.historyWindow }).map((o) => o.outcome)
  const state = computeFlowIndex(outcomes, {
    emaGain: cfg.emaGain,
    resetFactor: cfg.resetFactor,
    partialFactor: cfg.partialFactor,
  })
  const lambda = computeLambdaFlow(state.phi, cfg.lambdaBase, cfg.alpha)
  const mode: FlowMode = cfg.experiment.abEnabled ? flowAbArm(nodeId) : 'flow_on'

  // flow_off arm — full legacy neighbourhood, recorded as the A/B control.
  if (mode === 'flow_off') {
    const base = buildTaskContext(store, nodeId)
    if (!base) return null
    const baseline = base.metrics.estimatedTokens
    recordMetric(store, {
      projectId,
      nodeId,
      mode,
      phi: state.phi,
      lambda,
      tokensBaseline: baseline,
      tokensActual: baseline,
      prunedCount: 0,
      pinnedCount: 0,
    })
    return {
      context: base,
      pinnedInvariants: [],
      flow: {
        enabled: true,
        mode,
        phi: state.phi,
        streak: state.streak,
        lambda,
        prunedCount: 0,
        pinnedCount: 0,
        tokensBaseline: baseline,
        tokensActual: baseline,
        tokensSaved: 0,
      },
    }
  }

  // flow_on arm — decayed neighbourhood with the pinned-invariant floor.
  const decayed = buildDecayedTaskContext(store, nodeId, {
    lambda,
    maxDepth: cfg.maxDepth,
    weightThreshold: cfg.weightThreshold,
    pinnedTypes: new Set(cfg.pinnedTypes),
  })
  if (!decayed) return null

  // Information-Bottleneck gate (opt-in lever) — if the decay dropped task-
  // predictive keywords beyond what the token savings justify, reject it and
  // serve the lossless baseline. Default OFF ⇒ untouched legacy flow behaviour.
  const gate = resolveInfoBottleneckGate(store)
  if (gate.on) {
    const base = buildTaskContext(store, nodeId)
    if (
      base &&
      !acceptTextCompression(taskPredictiveText(base), taskPredictiveText(decayed.context), {
        beta: gate.beta,
        estimateTokens,
      })
    ) {
      const baseline = base.metrics.estimatedTokens
      recordMetric(store, {
        projectId,
        nodeId,
        mode,
        phi: state.phi,
        lambda,
        tokensBaseline: baseline,
        tokensActual: baseline,
        prunedCount: 0,
        pinnedCount: 0,
      })
      return {
        context: base,
        pinnedInvariants: [],
        flow: {
          enabled: true,
          mode,
          phi: state.phi,
          streak: state.streak,
          lambda,
          prunedCount: 0,
          pinnedCount: 0,
          tokensBaseline: baseline,
          tokensActual: baseline,
          tokensSaved: 0,
        },
      }
    }
  }

  recordMetric(store, {
    projectId,
    nodeId,
    mode,
    phi: state.phi,
    lambda,
    tokensBaseline: decayed.meta.tokensBaseline,
    tokensActual: decayed.meta.tokensActual,
    prunedCount: decayed.meta.prunedCount,
    pinnedCount: decayed.meta.pinnedCount,
  })

  return {
    context: decayed.context,
    pinnedInvariants: decayed.meta.pinnedInvariants,
    flow: {
      enabled: true,
      mode,
      phi: state.phi,
      streak: state.streak,
      lambda,
      prunedCount: decayed.meta.prunedCount,
      pinnedCount: decayed.meta.pinnedCount,
      tokensBaseline: decayed.meta.tokensBaseline,
      tokensActual: decayed.meta.tokensActual,
      tokensSaved: decayed.meta.tokensSaved,
    },
  }
}

/**
 * Render a {@link FlowCompactResult} into the structured XML compact format.
 * Uses the same data as {@link formatFlowContext} but outputs XML with sections:
 * current_focus, environment, completed_tasks, active_issues, code_state, important_context.
 */
export function formatFlowContextXml(result: FlowCompactResult): string {
  const { context: ctx, pinnedInvariants } = result

  const activeIssues: XmlCompactFields['activeIssues'] = []
  const openBlockers = ctx.blockers.filter((b) => b.status !== 'done')
  for (const b of openBlockers) {
    activeIssues.push({ severity: 'critical', description: `Blocker: ${b.title} (${b.status})` })
  }
  const openDeps = ctx.dependsOn.filter((d) => !d.resolved)
  for (const d of openDeps) {
    activeIssues.push({ severity: 'warning', description: `Depends on: ${d.title} (${d.status})` })
  }

  const importantCtx: string[] = []
  if (ctx.acceptanceCriteria.length > 0) {
    importantCtx.push('Acceptance Criteria:')
    for (const ac of ctx.acceptanceCriteria) importantCtx.push(`• ${ac}`)
  }
  if (pinnedInvariants.length > 0) {
    importantCtx.push('Pinned Invariants (never diluted):')
    for (const inv of pinnedInvariants) importantCtx.push(`• [${inv.type}] ${inv.title}`)
  }

  return buildXmlCompactOutput({
    currentFocus: {
      taskId: ctx.task.id,
      title: ctx.task.title,
      status: ctx.task.status,
    },
    environment: ctx.task.sprint ? { sprint: ctx.task.sprint } : undefined,
    activeIssues: activeIssues.length > 0 ? activeIssues : undefined,
    importantContext: importantCtx.length > 0 ? importantCtx : undefined,
  })
}
