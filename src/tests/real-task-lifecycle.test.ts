/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Integration: contract tests against RealTaskLifecycleService (SqliteStore).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { RealTaskLifecycleService, startTaskWithFlow } from '../core/services/task-lifecycle.js'
import { FakeTaskLifecycleService } from './helpers/fake-task-lifecycle'
import type { GraphNode } from '../core/graph/graph-types.js'
import { registerEnforcementHandlers } from '../core/hooks/enforcement-handlers.js'
import { _resetRegisteredHooks } from '../core/hooks/register-hook.js'
import { StatusChangeDeniedError } from '../core/hooks/hook-types.js'

/** Helper: create an in-memory SqliteStore with test seed data. */
async function createTestStore(): Promise<SqliteStore> {
  const store = await SqliteStore.open(':memory:')
  return store
}

/** Seed helper nodes into a store. */
function seedNode(
  store: SqliteStore,
  overrides: Partial<GraphNode> & { id: string; type: GraphNode['type']; title: string },
): void {
  const now = new Date().toISOString()
  store.insertNode({
    id: overrides.id,
    type: overrides.type,
    title: overrides.title,
    description: overrides.description ?? '',
    status: overrides.status ?? 'backlog',
    priority: overrides.priority ?? 3,
    xpSize: overrides.xpSize ?? 'S',
    parentId: overrides.parentId ?? null,
    acceptanceCriteria: overrides.acceptanceCriteria ?? [],
    tags: overrides.tags ?? [],
    createdAt: now,
    updatedAt: now,
    metadata: {},
  })
}

describe('RealTaskLifecycleService contract (SqliteStore)', () => {
  let store: SqliteStore
  let service: RealTaskLifecycleService

  beforeEach(async () => {
    store = await createTestStore()
    store.initProject('test-project')
    service = new RealTaskLifecycleService(store)
  })

  afterEach(() => {
    store.close()
  })

  describe('findNext', () => {
    it('returns null when backlog is empty', () => {
      expect(service.findNext()).toBeNull()
    })

    it('returns highest priority backlog task', () => {
      seedNode(store, { id: 't_low', type: 'task', title: 'Low', priority: 5 })
      seedNode(store, { id: 't_high', type: 'task', title: 'High', priority: 1 })
      seedNode(store, { id: 't_done', type: 'task', title: 'Done', status: 'done', priority: 1 })

      const next = service.findNext()
      expect(next).not.toBeNull()
      expect(next!.id).toBe('t_high')
      expect(next!.priority).toBe(1)
    })
  })

  describe('startTask', () => {
    it('returns null when no tasks exist', () => {
      expect(service.startTask()).toBeNull()
    })

    it('marks task in_progress and returns context', () => {
      seedNode(store, { id: 't1', type: 'task', title: 'Test', acceptanceCriteria: ['AC1'] })

      const ctx = service.startTask('t1')
      expect(ctx).not.toBeNull()
      expect(ctx!.node.status).toBe('in_progress')
      expect(ctx!.acceptanceCriteria).toEqual(['AC1'])
      expect(Array.isArray(ctx!.children)).toBe(true)
    })

    it('returns null for non-existent nodeId', () => {
      expect(service.startTask('no-such-node')).toBeNull()
    })
  })

  describe('finishTask', () => {
    it('returns fail report for non-existent node', () => {
      const report = service.finishTask('no-such-node')
      expect(report.ready).toBe(false)
      expect(report.checks[0].passed).toBe(false)
    })

    it('returns fail report when AC missing', () => {
      seedNode(store, { id: 't_no_ac', type: 'task', title: 'No AC', status: 'in_progress' })
      const report = service.finishTask('t_no_ac')
      expect(report.ready).toBe(false)
    })

    it('completes task with valid AC and correct status', () => {
      seedNode(store, { id: 't_ok', type: 'task', title: 'Valid', status: 'in_progress', acceptanceCriteria: ['AC1'] })
      const report = service.finishTask('t_ok', 'done well', ['test.ts'])
      expect(report.ready).toBe(true)
      expect(report.passed).toBeGreaterThanOrEqual(4)
      expect(report.checks.find((c) => c.name === 'has_test_files')!.passed).toBe(true)
    })

    it('detects epic promotion when all siblings done', () => {
      const parentId = 'epic_parent'
      seedNode(store, { id: parentId, type: 'epic', title: 'Parent Epic' })
      seedNode(store, { id: 'child_a', type: 'task', title: 'A', status: 'done', parentId, acceptanceCriteria: ['AC'] })
      seedNode(store, {
        id: 'child_b',
        type: 'task',
        title: 'B',
        status: 'in_progress',
        parentId,
        acceptanceCriteria: ['AC'],
      })

      const report = service.finishTask('child_b')
      expect(report.ready).toBe(true)
      expect(report.epicPromotion).toBeDefined()
      expect(report.epicPromotion!.allChildrenDone).toBe(true)
      expect(report.epicPromotion!.parentTitle).toBe('Parent Epic')
    })

    it('blocks epic promotion when a done sibling has a required gap (node_wire_3a6f7a16d128 — epic-promotion-gate wire)', () => {
      const parentId = 'epic_parent_gap'
      seedNode(store, { id: parentId, type: 'epic', title: 'Parent Epic With Debt' })
      // child_a is 'done' but has NO acceptanceCriteria — a real, hidden required gap.
      seedNode(store, { id: 'gap_child_a', type: 'task', title: 'A', status: 'done', parentId })
      seedNode(store, {
        id: 'gap_child_b',
        type: 'task',
        title: 'B',
        status: 'in_progress',
        parentId,
        acceptanceCriteria: ['AC'],
      })

      const report = service.finishTask('gap_child_b')
      expect(report.epicPromotion).toBeDefined()
      expect(report.epicPromotion!.allChildrenDone).toBe(true)
      expect(report.epicPromotion!.blocked).toBe(true)
      expect(report.epicPromotion!.requiredGapCount).toBeGreaterThan(0)
    })
  })

  describe('updateStatus', () => {
    it('returns null for non-existent node', () => {
      expect(service.updateStatus('no-such', 'done')).toBeNull()
    })

    it('updates status and returns updated node', () => {
      seedNode(store, { id: 't_st', type: 'task', title: 'Status test', status: 'backlog' })
      const updated = service.updateStatus('t_st', 'in_progress')
      expect(updated).not.toBeNull()
      expect(updated!.status).toBe('in_progress')
    })

    describe('with the status:pre-change enforcement hook registered (node_5905c6c79faf)', () => {
      beforeEach(() => {
        _resetRegisteredHooks()
        registerEnforcementHandlers(process.cwd())
      })
      afterEach(() => {
        _resetRegisteredHooks()
      })

      it('denies backlog->done without skipHooks — TDD guard stays intact', () => {
        seedNode(store, { id: 't_gate', type: 'task', title: 'Gated', status: 'backlog' })
        expect(() => service.updateStatus('t_gate', 'done')).toThrow(StatusChangeDeniedError)
        expect(store.getNodeById('t_gate')?.status).toBe('backlog')
      })

      it('denies backlog->done with skipHooks explicitly false — same as omitted', () => {
        seedNode(store, { id: 't_gate_explicit', type: 'task', title: 'Gated explicit', status: 'backlog' })
        expect(() => service.updateStatus('t_gate_explicit', 'done', { skipHooks: false })).toThrow(
          StatusChangeDeniedError,
        )
        expect(store.getNodeById('t_gate_explicit')?.status).toBe('backlog')
      })

      it('in_progress->done still succeeds without skipHooks — normal TDD path untouched', () => {
        seedNode(store, { id: 't_normal', type: 'task', title: 'Normal path', status: 'in_progress' })
        const updated = service.updateStatus('t_normal', 'done')
        expect(updated?.status).toBe('done')
      })

      it('honours skipHooks:true — the --force path actually bypasses the hook', () => {
        seedNode(store, { id: 't_forced', type: 'task', title: 'Forced', status: 'backlog' })
        const updated = service.updateStatus('t_forced', 'done', { skipHooks: true })
        expect(updated?.status).toBe('done')
      })
    })
  })

  describe('prefetch (node_wire_a97c276bb049 — task-prefetcher wire)', () => {
    it('finishTask prefetches context for the predicted next task', () => {
      seedNode(store, {
        id: 't_done_first',
        type: 'task',
        title: 'Done first',
        status: 'in_progress',
        acceptanceCriteria: ['AC1'],
      })
      seedNode(store, { id: 't_next', type: 'task', title: 'Next up', priority: 1, acceptanceCriteria: ['AC1'] })

      service.finishTask('t_done_first', 'done well', ['test.ts'])

      const cached = service.getPrefetchedContext('t_next')
      expect(cached).not.toBeNull()
      expect(cached!.query).toBe('Next up')
      expect(cached!.context).toContain('Next up')
    })

    it('finishTask does not throw when there is no next task to prefetch', () => {
      seedNode(store, {
        id: 't_only',
        type: 'task',
        title: 'Only task',
        status: 'in_progress',
        acceptanceCriteria: ['AC1'],
      })
      expect(() => service.finishTask('t_only', 'done well', ['test.ts'])).not.toThrow()
      expect(service.getPrefetchedContext('t_only')).toBeNull()
    })

    it('getPrefetchedContext returns null for a node that was never prefetched', () => {
      expect(service.getPrefetchedContext('never-prefetched')).toBeNull()
    })

    it('startTask invalidates the prefetch cache when the requested node does not match the prediction', () => {
      seedNode(store, {
        id: 't_done_2',
        type: 'task',
        title: 'Done second',
        status: 'in_progress',
        acceptanceCriteria: ['AC1'],
      })
      seedNode(store, { id: 't_predicted', type: 'task', title: 'Predicted', priority: 1, acceptanceCriteria: ['AC1'] })
      seedNode(store, { id: 't_other', type: 'task', title: 'Other', priority: 2, acceptanceCriteria: ['AC1'] })

      service.finishTask('t_done_2', 'done well', ['test.ts'])
      expect(service.getPrefetchedContext('t_predicted')).not.toBeNull()

      service.startTask('t_other')
      expect(service.getPrefetchedContext('t_predicted')).toBeNull()
    })
  })

  describe('DoD checks completeness', () => {
    it('returns at least 4 required checks', () => {
      seedNode(store, { id: 't_dod', type: 'task', title: 'DoD', status: 'in_progress', acceptanceCriteria: ['AC'] })
      const report = service.finishTask('t_dod')
      const required = report.checks.filter((c) => c.severity === 'required')
      expect(required.length).toBeGreaterThanOrEqual(4)
    })

    it('all 8 check names are present (4 required + 4 recommended)', () => {
      seedNode(store, {
        id: 't_all',
        type: 'task',
        title: 'All checks',
        status: 'in_progress',
        acceptanceCriteria: ['AC'],
        xpSize: 'S',
      })
      const report = service.finishTask('t_all')
      const names = report.checks.map((c) => c.name)
      expect(names).toContain('has_acceptance_criteria')
      expect(names).toContain('ac_quality_pass')
      expect(names).toContain('no_unresolved_blockers')
      expect(names).toContain('status_flow_valid')
      expect(names).toContain('has_description')
      expect(names).toContain('not_oversized')
      expect(names).toContain('has_testable_ac')
      expect(names).toContain('has_test_files')
    })
  })

  describe('ArtifactCache integration', () => {
    it('startTask returns reuseHint when exact artifact exists', async () => {
      seedNode(store, {
        id: 't_reuse',
        type: 'task',
        title: 'Reuse Test',
        acceptanceCriteria: ['AC1', 'AC2'],
        tags: ['tag1'],
      })
      const { computeTaskSignature } = await import('../core/reuse/task-signature.js')
      const { recordArtifact } = await import('../core/reuse/artifact-cache.js')
      const sig = computeTaskSignature({
        title: 'Reuse Test',
        acceptanceCriteria: ['AC1', 'AC2'],
        type: 'task',
        tags: ['tag1'],
      })
      const db = store.getDb()
      recordArtifact(db, {
        id: 'art_reuse',
        signature: sig,
        nodeId: 't_reuse',
        appliedEdits: [{ path: 'test.ts', oldString: '', newString: 'new' }],
        outcome: 'success',
        createdAt: Date.now(),
      })

      const ctx = service.startTask('t_reuse')
      expect(ctx).not.toBeNull()
      expect(ctx!.reuseHint).toBeDefined()
      expect(ctx!.reuseHint!.edits).toHaveLength(1)
      expect(ctx!.reuseHint!.edits[0].path).toBe('test.ts')
    })

    it('startTask does not include reuseHint when no artifact exists', () => {
      seedNode(store, { id: 't_fresh', type: 'task', title: 'Fresh Task', acceptanceCriteria: ['AC1'] })
      const ctx = service.startTask('t_fresh')
      expect(ctx).not.toBeNull()
      expect(ctx!.reuseHint).toBeUndefined()
    })

    it('finishTask records artifact in cache on success', async () => {
      seedNode(store, {
        id: 't_rec',
        type: 'task',
        title: 'Record Test',
        status: 'in_progress',
        acceptanceCriteria: ['AC1'],
      })
      service.finishTask('t_rec', 'test pass', ['test.ts'])

      const db = store.getDb()
      const { queryBySignature } = await import('../core/reuse/artifact-cache.js')
      const { computeTaskSignature } = await import('../core/reuse/task-signature.js')
      const sig = computeTaskSignature({ title: 'Record Test', acceptanceCriteria: ['AC1'], type: 'task' })
      const rows = queryBySignature(db, sig)
      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows[0].outcome).toBe('success')
      expect(rows[0].nodeId).toBe('t_rec')
    })

    it('finishTask does not record artifact when DoD fails', async () => {
      seedNode(store, { id: 't_fail', type: 'task', title: 'Fail', status: 'in_progress' })
      service.finishTask('t_fail')

      const db = store.getDb()
      const { queryBySignature } = await import('../core/reuse/artifact-cache.js')
      const { computeTaskSignature } = await import('../core/reuse/task-signature.js')
      const sig = computeTaskSignature({ title: 'Fail', type: 'task' })
      const rows = queryBySignature(db, sig)
      expect(rows).toHaveLength(0)
    })
  })
})
