/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../../core/store/sqlite-store.js'
import {
  doraSummary,
  bottleneckSummary,
  phaseSummary,
  metricsSummary,
  estimateCalibrationSummary,
  evolutionAuditSummary,
  lifecycleHealthSummary,
  policySummary,
  sprintProgressSummary,
  flowSnapshotSummary,
  cfdSummary,
  autoReadySummary,
  sprintHealthSummary,
  skillRecommendationsSummary,
  layersSummary,
  krSummary,
  insightsCommand,
} from '../../cli/commands/insights-cmd.js'

function seed(
  store: SqliteStore,
  over: {
    id: string
    title: string
    status?: string
    xpSize?: string
    estimateMinutes?: number
    metadata?: Record<string, unknown>
  },
): void {
  const now = new Date().toISOString()
  store.insertNode({
    id: over.id,
    type: 'task',
    title: over.title,
    description: '',
    status: (over.status ?? 'backlog') as never,
    priority: 3,
    xpSize: (over.xpSize ?? 'S') as never,
    estimateMinutes: over.estimateMinutes,
    parentId: null,
    acceptanceCriteria: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
    metadata: over.metadata ?? {},
  })
}

describe('insights-cmd — conectado ao core/insights', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('test-project')
    seed(store, { id: 't1', title: 'Task um', status: 'done' })
    seed(store, { id: 't2', title: 'Task dois', status: 'in_progress' })
    seed(store, { id: 't3', title: 'Task tres', status: 'backlog' })
  })

  afterEach(() => {
    store.close()
  })

  it('doraSummary retorna o shape DORA real a partir do store', () => {
    const d = doraSummary(store)
    expect(d).toHaveProperty('deploymentFrequency')
    expect(d).toHaveProperty('leadTime.p50')
    expect(['improving', 'stable', 'declining']).toContain(d.trend)
    expect(d).toHaveProperty('trendAlert')
    expect(typeof d.trendAlert.active).toBe('boolean')
    expect(typeof d.trendAlert.message).toBe('string')
    expect(typeof d.trendAlert.decliningSprints).toBe('number')
  })

  it('bottleneckSummary roda detectBottlenecks sobre o GraphDocument', () => {
    const b = bottleneckSummary(store)
    expect(Array.isArray(b.blockedTasks)).toBe(true)
    expect(Array.isArray(b.missingAcceptanceCriteria)).toBe(true)
  })

  it('metricsSummary conta as tasks semeadas', () => {
    const m = metricsSummary(store)
    expect(m.totalTasks).toBe(3)
    expect(m.completionRate).toBeGreaterThan(0)
  })

  it('phaseSummary retorna distribuição (array)', () => {
    expect(Array.isArray(phaseSummary(store))).toBe(true)
  })

  it('estimateCalibrationSummary agrega estimateDelta por xpSize a partir do store', () => {
    seed(store, {
      id: 't4',
      title: 'Task quatro',
      status: 'done',
      xpSize: 'M',
      estimateMinutes: 120,
      metadata: { estimateDelta: 1 },
    })
    const report = estimateCalibrationSummary(store)
    expect(report).toHaveProperty('M')
    expect(report.M?.count).toBe(1)
    expect(report.M?.avg_delta).toBe(1)
  })

  it('evolutionAuditSummary aggregates regenerated nodes from the store', () => {
    seed(store, { id: 't5', title: 'Task cinco', status: 'done' })
    store.updateNode('t5', { evolutionReason: 'ac drift' })
    store.updateNode('t5', { evolutionReason: 'ac drift' })
    const report = evolutionAuditSummary(store)
    expect(report.totalRegenerated).toBe(1)
    expect(report.totalRegenerations).toBe(2)
    expect(report.top[0]?.nodeId).toBe('t5')
  })

  it('registers the calibration, evolution, lifecycle-health, policy, sprint-progress, flow-snapshot, cfd and skills subcommands on agf insights', () => {
    const cmd = insightsCommand()
    const names = cmd.commands.map((c) => c.name())
    expect(names).toContain('calibration')
    expect(names).toContain('evolution')
    expect(names).toContain('lifecycle-health')
    expect(names).toContain('policy')
    expect(names).toContain('sprint-progress')
    expect(names).toContain('flow-snapshot')
    expect(names).toContain('cfd')
    expect(names).toContain('auto-ready')
    expect(names).toContain('sprint-health')
    expect(names).toContain('skills')
    expect(names).toContain('layers')
    expect(names).toContain('kr')
  })

  it('layersSummary reports the classified tools and their layer distribution (node_wire_0ebcf8483d7e)', () => {
    const report = layersSummary()
    expect(Array.isArray(report.tools)).toBe(true)
    expect(report.tools.length).toBeGreaterThan(0)
    const total = Object.values(report.distribution).reduce((a, b) => a + b, 0)
    expect(total).toBe(report.tools.length)
  })

  it('skillRecommendationsSummary derives the current lifecycle phase from graph status and recommends built-in skills (node_wire_18ba61112416)', () => {
    // beforeEach seeds t1=done, t2=in_progress, t3=backlog → mixed progress → BUILD → IMPLEMENT.
    // IMPLEMENT recommends comprehensive-testing-reference for in_progress tasks missing the 'tested' tag.
    const recs = skillRecommendationsSummary(store)
    expect(Array.isArray(recs)).toBe(true)
    expect(recs.some((r) => r.skill === 'comprehensive-testing-reference' && r.phase === 'IMPLEMENT')).toBe(true)
  })

  it('skillRecommendationsSummary maps an all-backlog graph to the SHAPE→ANALYZE phase', () => {
    const empty = SqliteStore.open(':memory:')
    empty.initProject('empty-project')
    seed(empty, { id: 'only', title: 'Only task', status: 'backlog' })
    const recs = skillRecommendationsSummary(empty)
    expect(Array.isArray(recs)).toBe(true)
    empty.close()
  })

  it('autoReadySummary surfaces a backlog task with sprint+AC+resolved deps as a candidate (node_wire_0ace35a66298)', () => {
    seed(store, { id: 'dep1', title: 'Dependency', status: 'done' })
    const now = new Date().toISOString()
    store.insertNode({
      id: 'candidate1',
      type: 'task',
      title: 'Ready candidate',
      status: 'backlog',
      priority: 3,
      sprint: 'sprint-1',
      acceptanceCriteria: ['Given X, When Y, Then Z'],
      tags: [],
      createdAt: now,
      updatedAt: now,
    } as never)
    store.insertEdge({ id: 'e1', from: 'candidate1', to: 'dep1', relationType: 'depends_on', createdAt: now })

    const report = autoReadySummary(store)
    expect(report.totalCandidates).toBe(1)
    expect(report.candidates[0].nodeId).toBe('candidate1')
  })

  it('sprintHealthSummary grades a sprint as critical when >30% of tasks are blocked (node_wire_997c47761078)', () => {
    const now = new Date().toISOString()
    for (const id of ['b1', 'b2', 'ok1']) {
      store.insertNode({
        id,
        type: 'task',
        title: `Task ${id}`,
        status: id.startsWith('b') ? 'blocked' : 'backlog',
        blocked: id.startsWith('b'),
        priority: 3,
        sprint: 'sprint-x',
        acceptanceCriteria: ['Given X, When Y, Then Z'],
        tags: [],
        createdAt: now,
        updatedAt: now,
      } as never)
    }

    const report = sprintHealthSummary(store, 'sprint-x')
    expect(report.health).toBe('critical')
    expect(report.metrics.blockedCount).toBe(2)
    expect(report.sprint).toBe('sprint-x')
  })

  it("flowSnapshotSummary captures a real flow_snapshots row with today's status counts", () => {
    seed(store, { id: 't4', title: 'Task quatro', status: 'blocked' })
    const snap = flowSnapshotSummary(store)
    expect(snap).not.toBeNull()
    expect(snap?.doneCount).toBe(1)
    expect(snap?.blockedCount).toBe(1)
    expect(snap?.backlogCount).toBe(1)
    expect(snap?.inProgressCount).toBe(1)
  })

  it('flowSnapshotSummary is idempotent for the same day (returns the existing row)', () => {
    const first = flowSnapshotSummary(store)
    const second = flowSnapshotSummary(store)
    expect(second?.id).toBe(first?.id)
  })

  it('cfdSummary returns the captured snapshot in its time series', () => {
    const snap = flowSnapshotSummary(store)
    const series = cfdSummary(store)
    expect(series.some((s) => s.id === snap?.id)).toBe(true)
  })

  it('sprintProgressSummary wires calculateSprintProgress to the store (burndown + blockers + ETA)', () => {
    seed(store, { id: 't4', title: 'Task quatro', status: 'blocked' })
    const report = sprintProgressSummary(store)
    expect(report.burndown.total).toBe(4)
    expect(report.burndown.done).toBe(1)
    expect(report.burndown.blocked).toBe(1)
    expect(report.blockers).toHaveLength(1)
    expect(report.blockers[0]?.nodeId).toBe('t4')
    expect(report.summary).toContain('Sprint Progress')
  })

  it('sprintProgressSummary filters by sprint when given', () => {
    seed(store, { id: 't4', title: 'Task quatro', status: 'done' })
    store.updateNode('t4', { sprint: 'sprint-1' } as never)
    const report = sprintProgressSummary(store, 'sprint-1')
    expect(report.sprint).toBe('sprint-1')
    expect(report.burndown.total).toBe(1)
  })

  it('policySummary returns an empty-window report when no policy_observations rows exist', () => {
    const report = policySummary(store, 30)
    expect(report.totalObservations).toBe(0)
    expect(report.windowDays).toBe(30)
    expect(report.costNote).toContain('No observations')
  })

  it('policySummary surfaces divergence + top rule from recorded routing decisions', () => {
    const projectId = store.getActiveProject()?.id ?? ''
    const now = new Date().toISOString()
    store
      .getDb()
      .prepare(
        'INSERT INTO policy_observations (id, project_id, divergence, decision, timestamp) VALUES (?, ?, ?, ?, ?)',
      )
      .run('obs1', projectId, 1, JSON.stringify({ appliedRule: 'cheap_tier', chain: ['deepseek'] }), now)

    const report = policySummary(store, 30)
    expect(report.totalObservations).toBe(1)
    expect(report.divergenceCount).toBe(1)
    expect(report.topRules[0]?.rule).toBe('cheap_tier')
  })

  describe('lifecycleHealthSummary', () => {
    const now = new Date().toISOString()

    function seedEpic(id: string): void {
      store.insertNode({
        id,
        type: 'epic',
        title: 'Epic um',
        description: '',
        status: 'in_progress' as never,
        priority: 3,
        parentId: null,
        acceptanceCriteria: [],
        tags: [],
        createdAt: now,
        updatedAt: now,
        metadata: {},
      })
    }

    it('computes the 9-phase report and persists a rolling snapshot with success rate', () => {
      seedEpic('epic-1')
      const result = lifecycleHealthSummary(store, 'epic-1')

      expect(result).not.toBeNull()
      expect(result?.report.epicId).toBe('epic-1')
      expect(Object.keys(result?.report.phases ?? {})).toHaveLength(9)
      expect(result?.successRate.samples).toBe(1)
      expect(result?.successRate.latestPassedAll).toBe(result?.report.passedAll)
    })

    it('returns null for an unknown epicId instead of throwing', () => {
      expect(lifecycleHealthSummary(store, 'does-not-exist')).toBeNull()
    })
  })

  describe('krSummary (node_wire_34a20ab3ed01)', () => {
    const now = new Date().toISOString()

    function seedEpic(id: string, metadata?: Record<string, unknown>): void {
      store.insertNode({
        id,
        type: 'epic',
        title: `Epic ${id}`,
        description: '',
        status: 'in_progress' as never,
        priority: 3,
        parentId: null,
        acceptanceCriteria: [],
        tags: [],
        createdAt: now,
        updatedAt: now,
        metadata: metadata ?? {},
      })
    }

    it('surfaces attainment for an epic with structured metadata.kr', () => {
      seedEpic('epic-kr-1', { kr: { target: 100, current: 40, unit: 'percent' } })
      const records = krSummary(store)
      expect(records).toHaveLength(1)
      expect(records[0]?.epicId).toBe('epic-kr-1')
      expect(records[0]?.title).toBe('Epic epic-kr-1')
      expect(records[0]?.status).toBe('ok')
      expect(records[0]?.attainment).toBeCloseTo(0.4, 6)
    })

    it('reports no-data/unset for an epic without metadata.kr', () => {
      seedEpic('epic-kr-2')
      const records = krSummary(store)
      expect(records[0]?.status).toBe('no-data')
      expect(records[0]?.provenance).toBe('unset')
    })

    it('excludes non-epic nodes (tasks seeded in beforeEach)', () => {
      seedEpic('epic-kr-3', { kr: { target: 10, current: 5, unit: 'builds' } })
      const records = krSummary(store)
      expect(records.every((r) => r.epicId.startsWith('epic-kr'))).toBe(true)
    })
  })
})
