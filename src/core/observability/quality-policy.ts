/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * QualityPolicy — Declarative quality thresholds with safety/liveness properties.
 *
 * Implements Safety/Liveness Properties (Lamport, 1977):
 *   Safety (block): "nothing bad ever happens" — invariants never violated
 *   Liveness (warn): "something good eventually happens" — progress guaranteed
 *
 * Principle of Monotonicity: policies can only be added or activated,
 * never relaxed automatically by the agent. Relaxing a threshold requires
 * explicit human action.
 *
 * Layer: L2_Heuristic (FSM of thresholds, deterministic).
 */

import type Database from 'better-sqlite3'
import { generateId } from '../utils/id.js'
import { now } from '../utils/time.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'quality-policy.ts' })

// ── Interfaces ─────────────────────────────────────────

export interface QualityGate {
  metric: string
  operator: '>=' | '<=' | '==' | '!='
  threshold: number
  severity: 'block' | 'warn'
}

export interface QualityPolicy {
  id: string
  name: string
  gates: QualityGate[]
  active: boolean
}

export interface GateResult {
  metric: string
  operator: string
  threshold: number
  actual: number
  passed: boolean
  severity: 'block' | 'warn'
}

export interface PolicyResult {
  passed: boolean
  blockers: GateResult[]
  warnings: GateResult[]
}

// ── Row type ───────────────────────────────────────────

interface PolicyRow {
  id: string
  name: string
  gates: string
  active: number
  created_at: string
  updated_at: string
}

// ── Pure evaluation function ───────────────────────────

/**
 * Evaluate a quality policy against current metrics.
 * Pure function — no side effects, no DB access.
 */
export function evaluatePolicy(policy: QualityPolicy, currentMetrics: Record<string, number>): PolicyResult {
  const blockers: GateResult[] = []
  const warnings: GateResult[] = []

  for (const gate of policy.gates) {
    const actual = currentMetrics[gate.metric] ?? 0
    const passed = evaluateGate(actual, gate.operator, gate.threshold)

    const resultValue: GateResult = {
      metric: gate.metric,
      operator: gate.operator,
      threshold: gate.threshold,
      actual,
      passed,
      severity: gate.severity,
    }

    if (!passed) {
      if (gate.severity === 'block') {
        blockers.push(resultValue)
      } else {
        warnings.push(resultValue)
      }
    }
  }

  return {
    passed: blockers.length === 0,
    blockers,
    warnings,
  }
}

function evaluateGate(actual: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case '>=':
      return actual >= threshold
    case '<=':
      return actual <= threshold
    case '==':
      return actual === threshold
    case '!=':
      return actual !== threshold
    default:
      return false
  }
}

// ── QualityPolicyStore ─────────────────────────────────

export class QualityPolicyStore {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /** Create a new policy (inactive by default). */
  createPolicy(name: string, gates: QualityGate[]): string {
    const id = generateId('policy')
    const timestamp = now()

    this.db
      .prepare(
        'INSERT INTO quality_policies (id, name, gates, active, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)',
      )
      .run(id, name, JSON.stringify(gates), timestamp, timestamp)

    log.debug('policy:created', { id, name, gateCount: gates.length })
    return id
  }

  /** Activate a policy (deactivates all others). */
  activatePolicy(policyId: string): void {
    const tx = this.db.transaction(() => {
      this.db.prepare('UPDATE quality_policies SET active = 0, updated_at = ?').run(now())
      this.db.prepare('UPDATE quality_policies SET active = 1, updated_at = ? WHERE id = ?').run(now(), policyId)
    })
    tx()
    log.debug('policy:activated', { policyId })
  }

  /** Get the currently active policy. */
  getActivePolicy(): QualityPolicy | null {
    const row = this.db.prepare('SELECT * FROM quality_policies WHERE active = 1 LIMIT 1').get() as
      PolicyRow | undefined

    return row ? this.mapRow(row) : null
  }

  /** Get a policy by ID. */
  getPolicy(policyId: string): QualityPolicy | null {
    const row = this.db.prepare('SELECT * FROM quality_policies WHERE id = ?').get(policyId) as PolicyRow | undefined

    return row ? this.mapRow(row) : null
  }

  private mapRow(row: PolicyRow): QualityPolicy {
    return {
      id: row.id,
      name: row.name,
      gates: JSON.parse(row.gates) as QualityGate[],
      active: row.active === 1,
    }
  }
}
