/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * Tests for the scenario verdict store (node_a0e28320fe6b, épico node_56a63da5d5c8).
 *
 * PORQUÊ: `agf scenario` roda cada cenário num :memory: próprio e nada persiste,
 * então check/done não têm veredito de superfície para LER. Sem persistência, o
 * gate só poderia adivinhar — e adivinhar verde é o falso-passed que este épico
 * existe para matar. Ausência de run ⇒ 'missing', NUNCA 'passed'.
 *
 * Zero mock: Database(':memory:') real + migrations reais.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { PROFILE_NAMES, resolveProfile } from '../core/output/profiles.js'
import { evaluateScenario, type StepResult } from '../plugins/browser/scenario-oracle.js'
import {
  recordScenarioVerdict,
  readLatestScenarioVerdict,
  surfaceProofState,
  surfaceProofFromOracle,
  oracleDetail,
  surfaceProofPayload,
  surfaceProofBlocksDone,
  surfaceGateReport,
} from '../core/observability/scenario-verdict-store.js'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
})

describe('recordScenarioVerdict / readLatestScenarioVerdict', () => {
  it('persists a verdict for a nodeId and reads it back', () => {
    recordScenarioVerdict(db, { nodeId: 'node_x', passed: true, scenarioId: 'login-flow', ranAt: 1000 })
    const v = readLatestScenarioVerdict(db, 'node_x')
    expect(v).not.toBeNull()
    expect(v!.passed).toBe(true)
    expect(v!.scenarioId).toBe('login-flow')
    expect(v!.ranAt).toBe(1000)
  })

  it('two runs for the same nodeId → reads the MOST RECENT', () => {
    recordScenarioVerdict(db, { nodeId: 'node_x', passed: true, scenarioId: 's', ranAt: 1000 })
    recordScenarioVerdict(db, { nodeId: 'node_x', passed: false, scenarioId: 's', ranAt: 2000 })
    const v = readLatestScenarioVerdict(db, 'node_x')
    expect(v!.passed).toBe(false)
    expect(v!.ranAt).toBe(2000)
  })

  it('a later PASS supersedes an earlier fail (recency wins, not optimism)', () => {
    recordScenarioVerdict(db, { nodeId: 'node_x', passed: false, ranAt: 1000 })
    recordScenarioVerdict(db, { nodeId: 'node_x', passed: true, ranAt: 2000 })
    expect(readLatestScenarioVerdict(db, 'node_x')!.passed).toBe(true)
  })

  it('verdicts are isolated per nodeId (no cross-contamination)', () => {
    recordScenarioVerdict(db, { nodeId: 'node_a', passed: true, ranAt: 1000 })
    recordScenarioVerdict(db, { nodeId: 'node_b', passed: false, ranAt: 1000 })
    expect(readLatestScenarioVerdict(db, 'node_a')!.passed).toBe(true)
    expect(readLatestScenarioVerdict(db, 'node_b')!.passed).toBe(false)
  })

  it('no run for that node → null (absence is not a verdict)', () => {
    expect(readLatestScenarioVerdict(db, 'never_ran')).toBeNull()
  })

  it('stores the failure detail when the scenario failed', () => {
    recordScenarioVerdict(db, { nodeId: 'node_x', passed: false, ranAt: 1, detail: '2 assertions failed' })
    expect(readLatestScenarioVerdict(db, 'node_x')!.detail).toBe('2 assertions failed')
  })
})

describe('surfaceProofState — the gate-facing verdict', () => {
  it('no run → missing (never a false passed)', () => {
    expect(surfaceProofState(db, 'never_ran')).toBe('missing')
  })

  it('latest run passed → passed', () => {
    recordScenarioVerdict(db, { nodeId: 'node_x', passed: true, ranAt: 1 })
    expect(surfaceProofState(db, 'node_x')).toBe('passed')
  })

  it('latest run failed → failed (a stale earlier pass does not rescue it)', () => {
    recordScenarioVerdict(db, { nodeId: 'node_x', passed: true, ranAt: 1000 })
    recordScenarioVerdict(db, { nodeId: 'node_x', passed: false, ranAt: 2000 })
    expect(surfaceProofState(db, 'node_x')).toBe('failed')
  })
})

// ── Bridge: browser oracle verdict → gate state (node_8735fe8cdc54) ────
//
// Two verdict vocabularies existed side by side with nothing between them: the
// browser oracle returns passed|failed|inconclusive, while the gate store held a
// boolean. Collapsing the third value into `false` would tell the gate a scenario
// FAILED when the truth is that it never concluded — the exact false-negative twin
// of the false-success this oracle was built to prevent.
describe('surfaceProofFromOracle — the bridge between the two verdict domains', () => {
  it('maps a concluded pass to passed', () => {
    expect(surfaceProofFromOracle('passed')).toBe('passed')
  })

  it('maps a real failure to failed', () => {
    expect(surfaceProofFromOracle('failed')).toBe('failed')
  })

  it('keeps inconclusive distinct — never reported as a failure', () => {
    expect(surfaceProofFromOracle('inconclusive')).toBe('inconclusive')
  })

  it('never maps anything to passed except an explicit pass', () => {
    // The invariant that matters: no input other than a concluded pass may open
    // the gate. Enumerated so a new verdict value cannot silently become approval.
    const nonPassing = (['failed', 'inconclusive'] as const).map(surfaceProofFromOracle)
    expect(nonPassing).not.toContain('passed')
  })
})

describe('surfaceProofState — round-trips the oracle verdict through the store', () => {
  it('reports inconclusive for a run that never concluded', () => {
    recordScenarioVerdict(db, { nodeId: 'node_i', passed: false, detail: oracleDetail('inconclusive'), ranAt: 1000 })
    expect(surfaceProofState(db, 'node_i')).toBe('inconclusive')
  })

  it('still reports failed for a genuine failure', () => {
    recordScenarioVerdict(db, { nodeId: 'node_f', passed: false, detail: oracleDetail('failed'), ranAt: 1000 })
    expect(surfaceProofState(db, 'node_f')).toBe('failed')
  })

  it('treats a legacy row with free-text detail as before (no oracle marker)', () => {
    // Backward compatibility: rows written before the bridge carry prose in detail.
    recordScenarioVerdict(db, { nodeId: 'node_l', passed: false, detail: 'algo quebrou', ranAt: 1000 })
    expect(surfaceProofState(db, 'node_l')).toBe('failed')
  })
})

// ── End-to-end: real steps → oracle → gate state (node_8735fe8cdc54) ───
describe('evaluateScenario → surfaceProofFromOracle (the wire the gate depends on)', () => {
  const ok = (over: Partial<StepResult> = {}): StepResult => ({
    tool: 'click',
    ok: true,
    evidence: 'shot.png',
    concludes: true,
    ...over,
  })

  it('all steps ok and concluded → the gate sees passed', () => {
    const v = evaluateScenario([ok({ tool: 'goto', concludes: false }), ok()])
    expect(v.verdict).toBe('passed')
    expect(surfaceProofFromOracle(v.verdict)).toBe('passed')
  })

  it('any step failed → the gate sees failed', () => {
    const v = evaluateScenario([ok({ tool: 'goto', concludes: false }), ok({ ok: false })])
    expect(v.verdict).toBe('failed')
    expect(surfaceProofFromOracle(v.verdict)).toBe('failed')
  })

  it('zero steps → NEVER a pass; the gate sees inconclusive, not a false failure', () => {
    // The AC asked for `failed` here. The oracle already answers `inconclusive`,
    // which serves the AC's real intent (never a false success) more honestly: a
    // scenario that never ran did not break. What matters is that the gate cannot
    // read it as approval.
    const v = evaluateScenario([])
    expect(v.verdict).toBe('inconclusive')
    expect(surfaceProofFromOracle(v.verdict)).not.toBe('passed')
    expect(surfaceProofFromOracle(v.verdict)).toBe('inconclusive')
  })

  it('a step with no evidence cannot open the gate', () => {
    const v = evaluateScenario([ok({ evidence: undefined })])
    expect(surfaceProofFromOracle(v.verdict)).not.toBe('passed')
  })
})

// ── What the check output carries (node_56de4f2a54f3) ─────────────────
//
// The constraint on this epic is that surface-proof is ADDITIVE: a task with no
// scenario edge must behave exactly as today. So the payload fragment is empty
// for a non-surface node — not `surface_proof: null`, not `'n/a'`, absent — and
// the byte-identity of the existing output is preserved by construction.
describe('surfaceProofPayload — additive by construction', () => {
  it('contributes NOTHING for a non-surface task', () => {
    expect(surfaceProofPayload(false, 'missing')).toEqual({})
  })

  it('reports missing for a surface task that never ran a scenario', () => {
    expect(surfaceProofPayload(true, 'missing')).toEqual({ surface_proof: 'missing' })
  })

  it('carries each concluded state through unchanged', () => {
    for (const state of ['passed', 'failed', 'inconclusive'] as const) {
      expect(surfaceProofPayload(true, state)).toEqual({ surface_proof: state })
    }
  })

  it('never emits the key for a non-surface task, whatever the stored state', () => {
    // The regression that would break every non-surface consumer: leaking the key
    // once a verdict happens to exist in the store for an unrelated reason.
    for (const state of ['passed', 'failed', 'inconclusive', 'missing'] as const) {
      expect(Object.keys(surfaceProofPayload(false, state))).toHaveLength(0)
    }
  })
})

// ── The gate decision (node_4b365961b83a) ─────────────────────────────
//
// This is where evidence finally becomes a decision. Everything before it only
// reported. The rules that matter: only a concluded PASS may close a surface
// leaf; `missing` and `inconclusive` block exactly like `failed`, because "we
// never checked" and "we could not tell" are not approvals; and a task that
// never declared itself a surface is untouched.
describe('surfaceProofBlocksDone — evidence becomes a decision', () => {
  it('lets a non-surface task through for every possible state', () => {
    for (const state of ['passed', 'failed', 'missing', 'inconclusive'] as const) {
      expect(surfaceProofBlocksDone(false, state)).toBe(false)
    }
  })

  it('lets a surface task through only on a concluded pass', () => {
    expect(surfaceProofBlocksDone(true, 'passed')).toBe(false)
  })

  it('blocks a surface task whose scenario failed', () => {
    expect(surfaceProofBlocksDone(true, 'failed')).toBe(true)
  })

  it('blocks when no scenario ever ran — absence of proof is not proof', () => {
    expect(surfaceProofBlocksDone(true, 'missing')).toBe(true)
  })

  it('blocks when the scenario never concluded — "cannot tell" is not approval', () => {
    // The value the whole honest-oracle series exists for. If inconclusive let a
    // done through, every unreliable run would quietly become a delivery.
    expect(surfaceProofBlocksDone(true, 'inconclusive')).toBe(true)
  })
})

// ── The verdict must survive the output layer (node_4b365961b83a) ──────
//
// A refusal the agent cannot parse is a refusal that gets retried blindly. The
// per-command output PROFILES carry an explicit select whitelist, so a new
// payload key is projected away unless listed — a second, separate place (after
// the noise deny-list) where a shipped capability turns invisible.
describe('output profiles carry surface_proof on the done envelope', () => {
  it('every profile that projects done keeps the surface_proof field', () => {
    for (const name of PROFILE_NAMES) {
      const resolved = resolveProfile(name, 'done')
      if (!resolved?.select) continue
      expect(resolved.select, `profile ${name} drops surface_proof from done`).toContain('data.surface_proof')
    }
  })
})

// ── The KR instrument (node_af8a42bfa371) ─────────────────────────────
//
// A KR is only worth reading if its instrument is demonstrably plugged in. So
// this report computes its numbers by running the REAL gate decision over the
// REAL rows — never by asserting a constant. A hardcoded `false_positive_rate: 0`
// would report success just as happily with the gate unwired, which is the
// failure this whole epic exists to prevent.
describe('surfaceGateReport — the KR instrument', () => {
  const surfaceIds = ['node_s1', 'node_s2']

  it('counts zero surface leaves when nothing declared itself a surface', () => {
    const r = surfaceGateReport(db, [])
    expect(r.surfaceLeaves).toBe(0)
    expect(r.gated).toBe(0)
  })

  it('counts a surface leaf as gated once a verdict exists to decide on', () => {
    recordScenarioVerdict(db, { nodeId: 'node_s1', passed: true, detail: oracleDetail('passed'), ranAt: 1000 })
    const r = surfaceGateReport(db, surfaceIds)
    expect(r.surfaceLeaves).toBe(2)
    expect(r.gated).toBe(1)
  })

  it('reports a surface leaf with no run as ungated — never as a silent pass', () => {
    const r = surfaceGateReport(db, surfaceIds)
    expect(r.blockedStates.missing).toBe(2)
  })

  it('counts an inconclusive run as blocked, not as failed', () => {
    recordScenarioVerdict(db, { nodeId: 'node_s1', passed: false, detail: oracleDetail('inconclusive'), ranAt: 1000 })
    const r = surfaceGateReport(db, surfaceIds)
    expect(r.blockedStates.inconclusive).toBe(1)
    expect(r.blockedStates.failed).toBe(0)
  })

  it('derives false positives by RUNNING the gate, so the number cannot be a constant', () => {
    // Every passing leaf must be let through. If someone inverts the gate, this
    // count rises — which is exactly what makes the zero meaningful.
    recordScenarioVerdict(db, { nodeId: 'node_s1', passed: true, detail: oracleDetail('passed'), ranAt: 1000 })
    recordScenarioVerdict(db, { nodeId: 'node_s2', passed: true, detail: oracleDetail('passed'), ranAt: 1000 })
    const r = surfaceGateReport(db, surfaceIds)
    expect(r.falsePositives).toBe(0)
    expect(r.gated).toBe(2)
  })
})

// ── Instrument-is-plugged-in proof (node_af8a42bfa371 AC1) ────────────
//
// The counts above are only trustworthy if a genuinely failing scenario really
// does stop a done. This walks the WHOLE chain with a fabricated failure —
// oracle verdict, stored state, gate decision — so the claim rests on the same
// functions production calls, not on three separate unit assertions that could
// each pass while the wiring between them is broken.
describe('a fabricated failing step blocks the done (end to end)', () => {
  it('one step with ok=false travels all the way to a blocked gate', () => {
    const verdict = evaluateScenario([
      { tool: 'goto', ok: true, evidence: 'a.png' },
      { tool: 'submit', ok: false, concludes: true },
    ])
    expect(verdict.verdict).toBe('failed')

    recordScenarioVerdict(db, {
      nodeId: 'node_fab',
      passed: false,
      detail: oracleDetail(surfaceProofFromOracle(verdict.verdict) === 'failed' ? 'failed' : 'inconclusive'),
      ranAt: 1000,
    })

    const state = surfaceProofState(db, 'node_fab')
    expect(state).toBe('failed')
    expect(surfaceProofBlocksDone(true, state)).toBe(true)

    const report = surfaceGateReport(db, ['node_fab'])
    expect(report.gated).toBe(0)
    expect(report.blockedStates.failed).toBe(1)
  })

  it('flipping that single step to ok=true is what makes the chain pass', () => {
    // The counter-proof: same path, one bit different. Without it, a chain that
    // always blocks would satisfy the test above while proving nothing.
    const verdict = evaluateScenario([
      { tool: 'goto', ok: true, evidence: 'a.png' },
      { tool: 'submit', ok: true, evidence: 'b.png', concludes: true },
    ])
    expect(verdict.verdict).toBe('passed')
    expect(surfaceProofBlocksDone(true, surfaceProofFromOracle(verdict.verdict))).toBe(false)
  })
})

// ── Counting hollow greens (node_49483eeeac82) ────────────────────────
//
// The oracle now says how strongly a pass was corroborated, and nothing read it:
// the report counted every pass alike, so a scenario that merely arrived somewhere
// scored identically to one that proved it arrived where it claimed. A KR keyed on
// that number cannot tell the difference it exists to police.
//
// Legacy rows carry no level. They are counted as UNKNOWN rather than assumed
// corroborated — inheriting the benefit of the doubt is how an old hollow green
// quietly satisfies a new, stricter bar.
describe('oracleDetail — carries the corroboration level', () => {
  it('round-trips the level through the stored detail', () => {
    recordScenarioVerdict(db, { nodeId: 'node_c', passed: true, detail: oracleDetail('passed', 'identity'), ranAt: 1 })
    expect(surfaceProofState(db, 'node_c')).toBe('passed')
    expect(surfaceGateReport(db, ['node_c']).corroboration.identity).toBe(1)
  })

  it('still reads a legacy detail with no level (backward compatible)', () => {
    recordScenarioVerdict(db, { nodeId: 'node_l', passed: true, detail: oracleDetail('passed'), ranAt: 1 })
    expect(surfaceProofState(db, 'node_l')).toBe('passed')
  })
})

describe('surfaceGateReport — hollow greens are visible', () => {
  const record = (id: string, level?: 'none' | 'identity' | 'effect' | 'both'): void => {
    recordScenarioVerdict(db, { nodeId: id, passed: true, detail: oracleDetail('passed', level), ranAt: 1 })
  }

  it('counts a pass with no corroboration as hollow', () => {
    record('node_h', 'none')
    const r = surfaceGateReport(db, ['node_h'])
    expect(r.gated).toBe(1)
    expect(r.hollow).toBe(1)
  })

  it('does NOT count a fully corroborated pass as hollow', () => {
    record('node_b', 'both')
    const r = surfaceGateReport(db, ['node_b'])
    expect(r.gated).toBe(1)
    expect(r.hollow).toBe(0)
    expect(r.corroboration.both).toBe(1)
  })

  it('counts a legacy row as unknown, never as corroborated', () => {
    record('node_legacy')
    const r = surfaceGateReport(db, ['node_legacy'])
    expect(r.corroboration.unknown).toBe(1)
    expect(r.corroboration.both).toBe(0)
    expect(r.hollow).toBe(0)
  })

  it('the levels account for every gated leaf — no pass is silently uncounted', () => {
    record('node_1', 'none')
    record('node_2', 'identity')
    record('node_3')
    const r = surfaceGateReport(db, ['node_1', 'node_2', 'node_3'])
    const summed = Object.values(r.corroboration).reduce((a, b) => a + b, 0)
    expect(summed).toBe(r.gated)
  })
})

describe('output profiles carry the surface gate on the metrics envelope', () => {
  it('every profile that projects metrics keeps surfaceGate', () => {
    // The KR reads this number. Projected away, `agf metrics` shows everything
    // except whether the gate is governing anything — and the omission is silent.
    for (const name of PROFILE_NAMES) {
      const resolved = resolveProfile(name, 'metrics')
      if (!resolved?.select) continue
      expect(resolved.select, `profile ${name} drops surfaceGate from metrics`).toContain('data.surfaceGate')
    }
  })
})
