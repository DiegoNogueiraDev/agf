/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../../core/store/sqlite-store.js'
import { runGate, GATE_PHASES } from '../../cli/commands/gate-cmd.js'

function seed(store: SqliteStore, id: string, type: string, title: string, status = 'backlog'): void {
  const now = new Date().toISOString()
  store.insertNode({
    id,
    type: type as never,
    title,
    description: 'desc',
    status: status as never,
    priority: 3,
    xpSize: 'S',
    parentId: null,
    acceptanceCriteria: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
    metadata: {},
  })
}

describe('gate-cmd — conecta core/{designer,reviewer,handoff,deployer,listener}', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('test-project')
    seed(store, 'e1', 'epic', 'Epic A')
    seed(store, 't1', 'task', 'Task 1', 'done')
    seed(store, 't2', 'task', 'Task 2', 'in_progress')
  })

  afterEach(() => {
    store.close()
  })

  it('cada fase do lifecycle produz um GateReport real', () => {
    for (const phase of GATE_PHASES) {
      const r = runGate(store, phase, { rootDir: process.cwd() })
      expect(r, `gate ${phase}`).not.toBeNull()
      expect(typeof r!.ready).toBe('boolean')
      expect(r!.score).toBeGreaterThanOrEqual(0)
      expect(r!.score).toBeLessThanOrEqual(100)
      expect(Array.isArray(r!.checks)).toBe(true)
      expect(typeof r!.grade).toBe('string')
    }
  })

  it('checks têm a forma uniforme {name, passed, severity}', () => {
    const r = runGate(store, 'review')!
    expect(r.checks.length).toBeGreaterThan(0)
    for (const c of r.checks) {
      expect(typeof c.name).toBe('string')
      expect(typeof c.passed).toBe('boolean')
      expect(typeof c.severity).toBe('string')
    }
  })

  it('fase desconhecida retorna null', () => {
    expect(runGate(store, 'fantasma')).toBeNull()
  })

  it('sem currentPhase, gate design retorna o GateReport plano (default inalterado)', () => {
    const r = runGate(store, 'design')
    expect(r).not.toBeNull()
    expect(typeof (r as { ready: boolean }).ready).toBe('boolean')
    expect((r as { advisory?: boolean }).advisory).toBeUndefined()
  })

  it('currentPhase=DESIGN retorna o report espelhado no topo (binding, out-of-phase-advisory AC1)', () => {
    const r = runGate(store, 'design', { currentPhase: 'DESIGN' }) as Record<string, unknown>
    expect(r.ok).toBe(true)
    expect(r.mode).toBe('design_ready')
    expect(r.advisory).toBeUndefined()
    expect(typeof r.ready).toBe('boolean') // spread at top level, not nested under data
  })

  it('currentPhase=IMPLEMENT envelopa o report como advisory não-vinculante (AC2)', () => {
    const r = runGate(store, 'design', { currentPhase: 'IMPLEMENT' }) as Record<string, unknown>
    expect(r.ok).toBe(true)
    expect(r.mode).toBe('design_ready')
    expect(r.advisory).toBe(true)
    expect(typeof r.phaseWarning).toBe('string')
    expect((r.data as { ready: boolean }).ready).toBeTypeOf('boolean')
  })

  describe('deploy gate — has_snapshot / knowledge_captured reflect real state (node_wire_e5fd0bac204e)', () => {
    it('has_snapshot fails when no snapshot exists', () => {
      const r = runGate(store, 'deploy')!
      const check = r.checks.find((c) => c.name === 'has_snapshot')
      expect(check?.passed).toBe(false)
    })

    it('has_snapshot passes once a real snapshot has been created via store.createSnapshot()', () => {
      store.createSnapshot()
      const r = runGate(store, 'deploy')!
      const check = r.checks.find((c) => c.name === 'has_snapshot')
      expect(check?.passed).toBe(true)
    })

    it('knowledge_captured passes once a real knowledge_documents row exists', () => {
      const db = store.getDb()
      const now = new Date().toISOString()
      db.prepare(
        `INSERT INTO knowledge_documents (id, source_type, source_id, title, content, content_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('kd1', 'test', 'src1', 'Title', 'content', 'hash1', now, now)

      const r = runGate(store, 'deploy')!
      const check = r.checks.find((c) => c.name === 'knowledge_captured')
      expect(check?.passed).toBe(true)
    })
  })

  describe('adr-challenge gate (node_wire_2bb3098e8120)', () => {
    // Composite fitness = friction*0.4 + optimality*0.35 (100, no jtbd nodes) + reversibility*0.25.
    // 2 friction keywords ("manual configuration", "additional install") -> friction=60.
    // Lock-in keywords with zero reversible keywords -> reversibility=0.
    // composite = 60*0.4 + 100*0.35 + 0*0.25 = 59 < PASS_THRESHOLD(60) -> CHALLENGE_FAILED.
    const FAILING_DECISION_DESCRIPTION =
      'Requires manual configuration and additional install. This is a permanent, irreversible schema change with vendor lock-in risk.'

    function seedFailingDecision(): void {
      const now = new Date().toISOString()
      store.insertNode({
        id: 'd1',
        type: 'decision' as never,
        title: 'Risky decision',
        description: FAILING_DECISION_DESCRIPTION,
        status: 'backlog' as never,
        priority: 3,
        xpSize: 'S',
        parentId: null,
        acceptanceCriteria: [],
        tags: [],
        createdAt: now,
        updatedAt: now,
        metadata: {},
      })
    }

    it('returns ready:true and score:100 when there are no decision nodes', () => {
      const r = runGate(store, 'adr-challenge')!
      expect(r.ready).toBe(true)
      expect(r.score).toBe(100)
    })

    it('reports a failing decision node without blocking (default mode: advisory)', () => {
      seedFailingDecision()
      const r = runGate(store, 'adr-challenge')!
      expect(r.ready).toBe(true)
      const check = r.checks.find((c) => c.name === 'adr_challenge')
      expect(check?.passed).toBe(false)
    })

    it('blocks (ready:false) in strict mode when a decision fails its challenge', () => {
      seedFailingDecision()
      const r = runGate(store, 'adr-challenge', { adrChallengeMode: 'strict' })!
      expect(r.ready).toBe(false)
    })

    it('off mode always passes', () => {
      seedFailingDecision()
      const r = runGate(store, 'adr-challenge', { adrChallengeMode: 'off' })!
      expect(r.ready).toBe(true)
    })
  })
})
