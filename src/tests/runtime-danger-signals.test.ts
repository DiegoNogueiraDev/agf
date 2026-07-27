/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_a014e15fdc37 AC coverage: Runtime Danger Signals
 *
 * AC1: Query llm_call_ledger for error_rate_spike detection (rolling window)
 * AC2: Consume error-handling-scanner.ts output as danger signal source
 * AC3: graph_operation_failure signals from failed healing_log entries
 * AC4: Merge runtime signals with static signals
 * AC5: Danger score includes runtime severity weighting + confidence
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../core/store/migrations.js'
import {
  detectRuntimeSignals,
  detectGraphOperationFailures,
  dangerSignalsFromScannerViolations,
  mergeDangerSignals,
  computeDangerScore,
} from '../core/immune/danger-signal.js'
import type { ViolationDetail } from '../core/harness/violation-detail.js'

// ── Test helpers ──────────────────────────────────────────────────────────────

function createDb(): Database.Database {
  const db = new Database(':memory:')
  runMigrations(db)
  return db
}

function insertLlmCall(db: Database.Database, opts: { error?: string; projectId?: string; ts?: number }): void {
  const id = `llm_${Math.random().toString(36).slice(2)}`
  const projectId = opts.projectId ?? 'default'
  const ts = opts.ts ?? Date.now()
  const status = opts.error ? 'error' : 'success'
  db.prepare(
    `INSERT INTO llm_call_ledger (id, project_id, ts, model, provider, input_tokens, output_tokens, cost_usd, status, error_kind)
     VALUES (?, ?, ?, 'test-model', 'test', 0, 0, 0, ?, ?)`,
  ).run(id, projectId, ts, status, opts.error ?? null)
}

function insertHealingLogFailed(db: Database.Database, nodeId: string, projectId = 'default'): void {
  const id = `hl_${Math.random().toString(36).slice(2)}`
  db.prepare(
    `INSERT INTO healing_log (id, project_id, ts, issue_type, severity, action_type, node_id, applied, success, message)
     VALUES (?, ?, ?, 'cycle_detected', 'high', 'remove_edge', ?, 1, 0, 'failed to apply')`,
  ).run(id, projectId, Date.now(), nodeId)
}

function makeViolation(overrides: Partial<ViolationDetail> = {}): ViolationDetail {
  return {
    file: 'src/core/foo.ts',
    line: 42,
    dimension: 'errors',
    violationType: 'raw_throw',
    evidence: 'throw new Error("oops")',
    confidence: 1.0,
    ...overrides,
  }
}

// ── AC1: llm_call_ledger error_rate_spike ─────────────────────────────────────

describe('AC1: detectRuntimeSignals — error_rate_spike from llm_call_ledger', () => {
  it('returns error_rate_spike when error rate > 15% in rolling window', () => {
    const db = createDb()
    // 20 calls: 4 with errors (20% rate — above 15% threshold)
    for (let i = 0; i < 16; i++) insertLlmCall(db, {})
    for (let i = 0; i < 4; i++) insertLlmCall(db, { error: 'timeout' })

    const signals = detectRuntimeSignals(db, 'default', 20)
    expect(signals.some((s) => s.kind === 'error_rate_spike')).toBe(true)
  })

  it('does not emit spike when error rate <= 15%', () => {
    const db = createDb()
    // 20 calls: 2 with errors (10% rate — below threshold)
    for (let i = 0; i < 18; i++) insertLlmCall(db, {})
    for (let i = 0; i < 2; i++) insertLlmCall(db, { error: 'timeout' })

    const signals = detectRuntimeSignals(db, 'default', 20)
    expect(signals.some((s) => s.kind === 'error_rate_spike')).toBe(false)
  })

  it('does not emit spike when fewer than 10 calls in window', () => {
    const db = createDb()
    for (let i = 0; i < 3; i++) insertLlmCall(db, { error: 'timeout' })

    const signals = detectRuntimeSignals(db, 'default', 100)
    expect(signals).toHaveLength(0)
  })

  it('error_rate_spike has severity critical and confidence > 0', () => {
    const db = createDb()
    for (let i = 0; i < 8; i++) insertLlmCall(db, {})
    for (let i = 0; i < 4; i++) insertLlmCall(db, { error: 'timeout' })

    const signals = detectRuntimeSignals(db, 'default', 12)
    const spike = signals.find((s) => s.kind === 'error_rate_spike')
    expect(spike).toBeDefined()
    expect(spike!.severity).toBe('critical')
    expect(spike!.confidence).toBeGreaterThan(0)
  })
})

// ── AC2: error-handling-scanner output as danger signals ──────────────────────

describe('AC2: dangerSignalsFromScannerViolations — scanner output converted to danger signals', () => {
  it('converts raw_throw violation to danger signal with kind raw_throw', () => {
    const violations: ViolationDetail[] = [makeViolation({ violationType: 'raw_throw', file: 'src/foo.ts', line: 10 })]
    const signals = dangerSignalsFromScannerViolations(violations)
    expect(signals).toHaveLength(1)
    expect(signals[0].kind).toBe('raw_throw')
    expect(signals[0].file).toBe('src/foo.ts')
    expect(signals[0].line).toBe(10)
  })

  it('converts swallowed_catch violation to danger signal', () => {
    const violations: ViolationDetail[] = [makeViolation({ violationType: 'swallowed_catch', evidence: 'catch(e) {}' })]
    const signals = dangerSignalsFromScannerViolations(violations)
    expect(signals[0].kind).toBe('swallowed_catch')
    expect(signals[0].severity).toBe('critical')
  })

  it('falls back to untyped_error for unknown violation types', () => {
    const violations: ViolationDetail[] = [makeViolation({ violationType: 'some_unknown_pattern' })]
    const signals = dangerSignalsFromScannerViolations(violations)
    expect(signals[0].kind).toBe('untyped_error')
  })

  it('inherits confidence from ViolationDetail', () => {
    const violations: ViolationDetail[] = [makeViolation({ confidence: 0.8 })]
    const signals = dangerSignalsFromScannerViolations(violations)
    expect(signals[0].confidence).toBe(0.8)
  })

  it('returns empty array for empty violations list', () => {
    expect(dangerSignalsFromScannerViolations([])).toEqual([])
  })
})

// ── AC3: graph_operation_failure from healing_log ─────────────────────────────

describe('AC3: detectGraphOperationFailures — failed graph ops as danger signals', () => {
  it('emits graph_operation_failure for each failed healing_log entry', () => {
    const db = createDb()
    insertHealingLogFailed(db, 'node-x')
    insertHealingLogFailed(db, 'node-y')

    const signals = detectGraphOperationFailures(db, 'default')
    expect(signals.filter((s) => s.kind === 'graph_operation_failure')).toHaveLength(2)
  })

  it('graph_operation_failure has severity high', () => {
    const db = createDb()
    insertHealingLogFailed(db, 'node-a')

    const signals = detectGraphOperationFailures(db, 'default')
    const s = signals.find((s) => s.kind === 'graph_operation_failure')
    expect(s!.severity).toBe('high')
  })

  it('returns empty when no failed healing entries exist', () => {
    const db = createDb()
    const signals = detectGraphOperationFailures(db, 'default')
    expect(signals.filter((s) => s.kind === 'graph_operation_failure')).toHaveLength(0)
  })

  it('nodeId appears in evidence field', () => {
    const db = createDb()
    insertHealingLogFailed(db, 'node-target')

    const signals = detectGraphOperationFailures(db, 'default')
    const s = signals.find((s) => s.kind === 'graph_operation_failure')
    expect(s!.evidence).toContain('node-target')
  })
})

// ── AC4: Merge static + runtime signals ──────────────────────────────────────

describe('AC4: mergeDangerSignals — combines static and runtime signal arrays', () => {
  it('merged array contains both static and runtime signals', () => {
    const db = createDb()
    insertHealingLogFailed(db, 'node-m')

    const staticSignals = dangerSignalsFromScannerViolations([makeViolation()])
    const runtimeSignals = detectGraphOperationFailures(db, 'default')
    const merged = mergeDangerSignals(staticSignals, runtimeSignals)

    expect(merged.length).toBe(staticSignals.length + runtimeSignals.length)
    expect(merged.some((s) => s.kind === 'raw_throw')).toBe(true)
    expect(merged.some((s) => s.kind === 'graph_operation_failure')).toBe(true)
  })

  it('merged array is empty when both inputs are empty', () => {
    expect(mergeDangerSignals([], [])).toEqual([])
  })
})

// ── AC5: computeDangerScore includes runtime severity weighting ───────────────

describe('AC5: computeDangerScore — runtime signals weighted by severity + confidence', () => {
  it('critical signals score higher than high-severity signals', () => {
    const criticalSignal = dangerSignalsFromScannerViolations([
      makeViolation({ violationType: 'swallowed_catch', confidence: 1.0 }),
    ])
    const highSignal = dangerSignalsFromScannerViolations([
      makeViolation({ violationType: 'raw_throw', confidence: 1.0 }),
    ])
    expect(computeDangerScore(criticalSignal)).toBeGreaterThan(computeDangerScore(highSignal))
  })

  it('score is 0 for empty signal array', () => {
    expect(computeDangerScore([])).toBe(0)
  })

  it('score capped at 100 regardless of signal volume', () => {
    const manySignals = Array.from({ length: 50 }, () =>
      dangerSignalsFromScannerViolations([makeViolation({ violationType: 'swallowed_catch' })]),
    ).flat()
    expect(computeDangerScore(manySignals)).toBeLessThanOrEqual(100)
  })

  it('lower confidence reduces score relative to confidence=1.0', () => {
    const highConf = dangerSignalsFromScannerViolations([makeViolation({ confidence: 1.0 })])
    const lowConf = dangerSignalsFromScannerViolations([makeViolation({ confidence: 0.3 })])
    expect(computeDangerScore(highConf)).toBeGreaterThan(computeDangerScore(lowConf))
  })
})
