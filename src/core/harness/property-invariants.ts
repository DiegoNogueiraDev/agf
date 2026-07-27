/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Property-Based Invariant Checking — Graph State Invariants
 *
 * Verifies runtime invariants against GraphDocument state:
 * - Referential integrity: edges must reference existing nodes
 * - Status monotonicity: done tasks should not regress to non-done
 * - DAG acyclicity: dependency graph must be cycle-free
 *
 * Runs inside finish_task pipeline (advisory mode by default).
 * Based on Design by Contract (Meyer 1986) principles.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import { detectCycles } from '../planner/dependency-chain.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'property-invariants.ts' })

// ── Types ───────────────────────────────────────────────

export interface PropertyInvariant {
  id: string
  name: string
  description: string
  severity: 'error' | 'warning'
  check: (doc: GraphDocument) => InvariantViolation[]
}

export interface InvariantViolation {
  invariantId: string
  nodeId?: string
  edgeId?: string
  message: string
  severity: 'error' | 'warning'
}

export interface InvariantResult {
  passed: boolean
  violations: InvariantViolation[]
  checkedInvariants: number
  durationMs: number
}

// ── Built-in Invariants ─────────────────────────────────

const referentialIntegrity: PropertyInvariant = {
  id: 'referential_integrity',
  name: 'Referential Integrity',
  description: 'Every edge must reference existing nodes (from and to)',
  severity: 'error',
  check: (doc: GraphDocument): InvariantViolation[] => {
    const nodeIds = new Set(doc.nodes.map((n) => n.id))
    const violations: InvariantViolation[] = []
    for (const edge of doc.edges) {
      const missing: string[] = []
      if (!nodeIds.has(edge.from)) missing.push(`from='${edge.from}'`)
      if (!nodeIds.has(edge.to)) missing.push(`to='${edge.to}'`)
      if (missing.length > 0) {
        violations.push({
          invariantId: 'referential_integrity',
          edgeId: edge.id,
          message: `Edge ${edge.id} references nonexistent node(s): ${missing.join(', ')}`,
          severity: 'error',
        })
      }
    }
    return violations
  },
}

const statusMonotonicity: PropertyInvariant = {
  id: 'status_monotonicity',
  name: 'Status Monotonicity',
  description: 'A done task should not regress to non-done status',
  severity: 'warning',
  check: (doc: GraphDocument): InvariantViolation[] => {
    const violations: InvariantViolation[] = []
    for (const node of doc.nodes) {
      const previousStatus = node.metadata?.previousStatus
      if (previousStatus === 'done' && node.status !== 'done') {
        violations.push({
          invariantId: 'status_monotonicity',
          nodeId: node.id,
          message: `Node '${node.title}' (${node.id}) regressed from done to ${node.status}`,
          severity: 'warning',
        })
      }
    }
    return violations
  },
}

const dagAcyclicity: PropertyInvariant = {
  id: 'dag_acyclicity',
  name: 'DAG Acyclicity',
  description: 'The dependency graph must not contain cycles',
  severity: 'error',
  check: (doc: GraphDocument): InvariantViolation[] => {
    const cycles = detectCycles(doc)
    return cycles.map((cycle, i) => ({
      invariantId: 'dag_acyclicity',
      message: `Dependency cycle detected (#${i + 1}): ${cycle.join(' → ')}`,
      severity: 'error' as const,
    }))
  },
}

// ── Public API ──────────────────────────────────────────

/** getBuiltInInvariants —  */
export function getBuiltInInvariants(): PropertyInvariant[] {
  return [referentialIntegrity, statusMonotonicity, dagAcyclicity]
}

/** checkInvariants —  */
export function checkInvariants(doc: GraphDocument, invariants: PropertyInvariant[]): InvariantResult {
  const start = performance.now()
  const allViolations: InvariantViolation[] = []
  for (const invariant of invariants) {
    try {
      const violations = invariant.check(doc)
      allViolations.push(...violations)
    } catch (err) {
      log.warn('property-invariants:check-error', {
        invariantId: invariant.id,
        error: String(err),
      })
    }
  }
  const durationMs = Math.round(performance.now() - start)
  if (allViolations.length > 0) {
    log.info('property-invariants:violations', {
      count: allViolations.length,
      invariants: [...new Set(allViolations.map((v) => v.invariantId))],
      durationMs,
    })
  }
  return {
    passed: allViolations.length === 0,
    violations: allViolations,
    checkedInvariants: invariants.length,
    durationMs,
  }
}
