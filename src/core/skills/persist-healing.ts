/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

/**
 * persist-healing — torna o self-healing PERSISTENTE. O `self-healing-engine`
 * só mutava um GraphDocument em memória e imprimia; aqui aplicamos as ações
 * curativas de volta ao SqliteStore E registramos cada uma em `healing_log`
 * (migration v101). MAPE-K: Monitor → Analyze → Plan → Execute → (persist).
 *
 * Immune memory (Burnet, 1959): subgraph fingerprints are stored in
 * `healing_patterns` (v119). Repeated exposure to the same fingerprint
 * increases confidence: 1st=0.5, 2nd≥0.6 (auto-propose), 3rd≥0.9 (auto-apply).
 */
import { createHash } from 'node:crypto'
import type { SqliteStore } from '../store/sqlite-store.js'
import type { NodeStatus } from '../graph/graph-types.js'
import type { HealingReport, HealingAction, HealingResult } from '../../schemas/healing.schema.js'
import {
  monitorGraph,
  analyzeIssues,
  planActions,
  executeActions,
  buildKnowledge,
  DEFAULT_HEALING_CONFIG,
} from './self-healing-engine.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'persist-healing.ts' })

export interface HealingRunOptions {
  apply: boolean
}

export interface HealingRunResult {
  report: HealingReport
  applied: number
  detected: number
}

export interface HealingLogRow {
  id: string
  ts: number
  issueType: string
  severity: string
  actionType: string
  nodeId: string | null
  applied: boolean
  success: boolean
  message: string
}

// ── Acute / Chronic Classification ───────────────────────────────────────────

/**
 * Issue severity category for the MAPE-K heal output.
 *
 * Acute: deterministic, self-repairable fix (e.g., remove a broken edge).
 * Chronic: requires a design decision or human judgment (e.g., cycle break).
 */
export type HealingIssueCategory = 'acute' | 'chronic'

/**
 * Classify a healing issue type as acute (auto-reparable) or chronic (human review).
 *
 * Acute issues have a unique, deterministic fix that can be safely applied
 * without risk of data loss or design regression.
 * Chronic issues involve trade-offs, design decisions, or complex cycles that
 * require human judgment before applying.
 */
export function classifyIssue(type: import('../../schemas/healing.schema.js').HealingIssueType): HealingIssueCategory {
  switch (type) {
    case 'broken_dependency':
    case 'stuck_task':
    case 'orphan_node':
    case 'stale_in_progress':
    case 'blocked_no_blocker':
    case 'container_epic_blocking':
      return 'acute'
    case 'cycle_detected':
    case 'missing_ac':
    case 'oversized_undecomposed':
    case 'done_with_pending_deps':
    case 'stale_resolved_risk':
      return 'chronic'
    default: {
      // Exhaustiveness guard: a new HealingIssueType must be classified here.
      const _exhaustive: never = type
      return _exhaustive
    }
  }
}

// ── Immune Memory (Burnet, 1959) ──────────────────────────────────────────────

export interface HealingPatternRow {
  fingerprint: string
  projectId: string
  issueType: string
  occurrenceCount: number
  confidence: number
  lastSeenAt: number
  autoApplied: boolean
}

/**
 * Deterministic hash of the subgraph involved in a healing event.
 *
 * Node IDs and edge types are sorted before hashing — order-invariant.
 * Uses SHA-256 truncated to 16 hex chars (64-bit collision resistance).
 */
export function computeSubgraphFingerprint(nodeIds: string[], edgeTypes: string[]): string {
  const canonical = [...nodeIds].sort().join(',') + '|' + [...edgeTypes].sort().join(',')
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16)
}

/**
 * Confidence formula (Burnet clonal selection analogy):
 *   1st exposure: 0.5 (naive — observed once, uncertain)
 *   2nd exposure: 0.7 (recall threshold for auto-propose, ≥ 0.6)
 *   3rd exposure: 0.9 (memory response for auto-apply, ≥ 0.9)
 *   cap: 1.0
 *
 * Formula: min(1.0, 0.3 + count × 0.2)
 */
export function computePatternConfidence(occurrenceCount: number): number {
  return Math.min(1.0, 0.3 + occurrenceCount * 0.2)
}

/** Get the healing pattern record for a fingerprint, or undefined if unseen. */
export function getHealingPattern(store: SqliteStore, fingerprint: string): HealingPatternRow | undefined {
  const db = store.getDb()
  const projectId = store.getProject()?.id ?? 'default'
  interface Raw {
    fingerprint: string
    project_id: string
    issue_type: string
    occurrence_count: number
    confidence: number
    last_seen_at: number
    auto_applied: number
  }
  const row = db
    .prepare('SELECT * FROM healing_patterns WHERE fingerprint = ? AND project_id = ?')
    .get(fingerprint, projectId) as Raw | undefined
  if (!row) return undefined
  return {
    fingerprint: row.fingerprint,
    projectId: row.project_id,
    issueType: row.issue_type,
    occurrenceCount: row.occurrence_count,
    confidence: row.confidence,
    lastSeenAt: row.last_seen_at,
    autoApplied: row.auto_applied === 1,
  }
}

/** Upsert a healing pattern, incrementing occurrence_count and recalculating confidence. */
export function upsertHealingPattern(store: SqliteStore, fingerprint: string, issueType: string): HealingPatternRow {
  const db = store.getDb()
  const projectId = store.getProject()?.id ?? 'default'
  const now = Date.now()
  const existing = getHealingPattern(store, fingerprint)
  if (existing) {
    const newCount = existing.occurrenceCount + 1
    const newConf = computePatternConfidence(newCount)
    db.prepare(
      `UPDATE healing_patterns SET occurrence_count = ?, confidence = ?, last_seen_at = ? WHERE fingerprint = ? AND project_id = ?`,
    ).run(newCount, newConf, now, fingerprint, projectId)
  } else {
    db.prepare(
      `INSERT INTO healing_patterns (fingerprint, project_id, issue_type, occurrence_count, confidence, last_seen_at, auto_applied) VALUES (?, ?, ?, 1, ?, ?, 0)`,
    ).run(fingerprint, projectId, issueType, computePatternConfidence(1), now)
  }
  return getHealingPattern(store, fingerprint) as HealingPatternRow
}

/** Aplica uma ação curativa bem-sucedida de volta ao store (persistência real). */
function applyToStore(store: SqliteStore, action: HealingAction): void {
  switch (action.type) {
    case 'update_status':
    case 'clear_blocked': {
      const newStatus = action.params?.['newStatus']
      if (typeof newStatus === 'string') store.updateNodeStatus(action.nodeId, newStatus as NodeStatus)
      if (action.type === 'clear_blocked') store.updateNode(action.nodeId, { blocked: false })
      break
    }
    case 'remove_edge': {
      const edgeId = action.params?.['edgeId']
      if (typeof edgeId === 'string') store.deleteEdge(edgeId)
      break
    }
    case 'flag_for_review':
    case 'add_flag': {
      const node = store.getNodeById(action.nodeId)
      if (node) store.updateNode(action.nodeId, { metadata: { ...node.metadata, healingReview: true } })
      break
    }
  }
}

function logHealing(store: SqliteStore, report: HealingReport, apply: boolean, fingerprint?: string): void {
  const db = store.getDb()
  const projectId = store.getProject()?.id ?? 'default'
  const ts = Date.now()
  const issueById = new Map(report.issues.map((i) => [i.id, i]))
  const resultByAction = new Map<string, HealingResult>(report.results.map((r) => [r.actionId, r]))
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO healing_log
     (id, project_id, ts, issue_type, severity, action_type, node_id, applied, success, message, subgraph_fingerprint)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const tx = db.transaction((actions: HealingAction[]) => {
    for (const action of actions) {
      const issue = issueById.get(action.issueId)
      const isCycleAction = issue?.type === 'cycle_detected'
      const result = resultByAction.get(action.id)
      stmt.run(
        `heal_${ts}_${action.id}`,
        projectId,
        ts,
        issue?.type ?? 'unknown',
        issue?.severity ?? 'low',
        action.type,
        action.nodeId,
        apply ? 1 : 0,
        result?.success ? 1 : 0,
        result?.message ?? '',
        isCycleAction ? (fingerprint ?? null) : null,
      )
    }
  })
  tx(report.actions)
}

/**
 * Roda o ciclo MAPE-K e persiste. Com `apply=false` (default) é dry-run: detecta
 * e registra no log sem mutar o grafo. Com `apply=true` aplica as ações ao store.
 *
 * Immune memory (Burnet, 1959): cycle_detected issues are fingerprinted.
 * If the same fingerprint has been seen ≥2 times (confidence ≥ 0.6), the action
 * is auto-proposed; if seen ≥3 times (confidence ≥ 0.9), auto-applied regardless
 * of options.apply.
 */
export function runHealing(store: SqliteStore, options: HealingRunOptions): HealingRunResult {
  const doc = store.toGraphDocument()
  const issues = analyzeIssues(monitorGraph(doc, DEFAULT_HEALING_CONFIG))
  const actions = planActions(issues, doc)

  // Compute fingerprint from cycle_detected issues
  const cycleNodeIds = issues.filter((i) => i.type === 'cycle_detected').map((i) => i.nodeId)
  const fingerprint = cycleNodeIds.length > 0 ? computeSubgraphFingerprint(cycleNodeIds, ['depends_on']) : undefined

  // Immune memory: check existing pattern confidence
  const pattern = fingerprint ? getHealingPattern(store, fingerprint) : undefined
  const patternConf = pattern ? pattern.confidence : 0

  // A recurrent pattern that crossed the auto-apply confidence (≥0.9) is surfaced as a
  // PROPOSAL only. A dry-run (options.apply === false) must NEVER mutate the graph —
  // mutation requires an explicit apply. (AUDIT-053)
  const autoApplyProposed = !options.apply && patternConf >= 0.9
  const effectiveApply = options.apply

  const results = executeActions(actions, doc, { dryRun: !effectiveApply })

  let applied = 0
  if (effectiveApply) {
    for (let i = 0; i < actions.length; i++) {
      if (results[i]?.success) {
        applyToStore(store, actions[i])
        applied++
      }
    }
  }

  const report = buildKnowledge(issues, actions, results)

  // Persist with fingerprint in healing_log
  logHealing(store, report, effectiveApply, fingerprint)

  // Upsert immune memory pattern for cycle_detected
  if (fingerprint && cycleNodeIds.length > 0) {
    upsertHealingPattern(store, fingerprint, 'cycle_detected')
  }

  log.info('healing:persisted', {
    detected: issues.length,
    applied,
    dryRun: !effectiveApply,
    fingerprint: fingerprint ?? null,
    patternConf,
    autoApplyProposed,
  })

  return { report, applied, detected: issues.length }
}

/** Lê o histórico de healing persistido (mais recente primeiro). */
export function listHealingLog(store: SqliteStore, limit = 50): HealingLogRow[] {
  const db = store.getDb()
  const projectId = store.getProject()?.id ?? 'default'
  interface Raw {
    id: string
    ts: number
    issue_type: string
    severity: string
    action_type: string
    node_id: string | null
    applied: number
    success: number
    message: string
  }
  const rows = db
    .prepare('SELECT * FROM healing_log WHERE project_id = ? ORDER BY ts DESC LIMIT ?')
    .all(projectId, limit) as Raw[]
  return rows.map((r) => ({
    id: r.id,
    ts: r.ts,
    issueType: r.issue_type,
    severity: r.severity,
    actionType: r.action_type,
    nodeId: r.node_id,
    applied: r.applied === 1,
    success: r.success === 1,
    message: r.message,
  }))
}
