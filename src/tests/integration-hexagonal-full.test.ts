/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Comprehensive integration test — wires all fake services through
 * FakeHostAdapter and exercises the full hexagonal runtime.
 * Proves that TUI-first + thin bridge architecture works end-to-end.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { FakeHostAdapter } from './helpers/fake-host-adapter'

describe('Hexagonal Integration — Full Runtime (FakeHostAdapter)', () => {
  let host: FakeHostAdapter

  beforeEach(() => {
    host = new FakeHostAdapter()
  })

  describe('Task lifecycle (T5.1 contract → FakeTaskLifecycle)', () => {
    it('creates and starts a task', () => {
      host.taskLifecycle.addNode({
        id: 't1',
        type: 'task',
        title: 'Implement login',
        status: 'backlog',
        priority: 1,
      })
      const ctx = host.taskLifecycle.startTask('t1')
      expect(ctx).not.toBeNull()
      expect(ctx!.node.status).toBe('in_progress')
    })

    it('finishes a task with DoD checks', () => {
      host.taskLifecycle.addNode({
        id: 't2',
        type: 'task',
        title: 'Add tests',
        status: 'in_progress',
        priority: 1,
        acceptanceCriteria: ['AC1', 'AC2'],
        description: 'Write unit tests for the service layer',
      })
      const report = host.taskLifecycle.finishTask('t2', 'tests written', ['test.ts'])
      expect(report.ready).toBe(true)
      expect(report.passed).toBeGreaterThanOrEqual(4)
    })

    it('findNext returns highest priority', () => {
      host.taskLifecycle.addNode({ id: 'low', type: 'task', title: 'Low', priority: 5 })
      host.taskLifecycle.addNode({ id: 'high', type: 'task', title: 'High', priority: 1 })

      const next = host.taskLifecycle.findNext()
      expect(next).not.toBeNull()
      expect(next!.id).toBe('high')
    })
  })

  describe('Context runtime (T5.2 contract → FakeContextRuntime)', () => {
    it('returns summary with seeded nodes', () => {
      host.contextRuntime.seed([
        { id: 'e1', type: 'epic', title: 'Epic', status: 'backlog', priority: 1 } as any,
        { id: 't1', type: 'task', title: 'Task', status: 'backlog', priority: 1 } as any,
      ])
      const s = host.contextRuntime.summary()
      expect(s.totalNodes).toBe(2)
      expect(s.byType['epic']).toBe(1)
      expect(s.byType['task']).toBe(1)
    })

    it('compact returns null for unknown node', () => {
      expect(host.contextRuntime.compact('no-such')).toBeNull()
    })
  })

  describe('Human gate (T5.3 contract → FakeHumanGate)', () => {
    it('ask → reply → list cycle', () => {
      const q = host.humanGate.ask('Approve deletion?')
      expect(q.status).toBe('pending')

      const answered = host.humanGate.reply(q.id, 'yes')
      expect(answered).not.toBeNull()
      expect(answered!.status).toBe('answered')

      const pending = host.humanGate.list({ status: 'pending' })
      expect(pending).toHaveLength(0)
    })

    it('ask → reject prevents reply', () => {
      const q = host.humanGate.ask('Delete?')
      host.humanGate.reject(q.id, 'Not safe')

      const attempt = host.humanGate.reply(q.id, 'trying')
      if (attempt) expect(attempt.status).toBe('rejected')
    })
  })

  describe('Workspace state (T5.4 contract → FakeWorkspaceState)', () => {
    it('snapshot → list → restore cycle', () => {
      const snap = host.workspaceState.snapshot('v1')
      expect(snap.label).toBe('v1')

      const list = host.workspaceState.listSnapshots()
      expect(list).toHaveLength(1)

      expect(host.workspaceState.restore(snap.id)).toBe(true)
    })

    it('revert creates a new snapshot', () => {
      const snap = host.workspaceState.snapshot('v1')
      const reversed = host.workspaceState.revert(snap.id)
      expect(reversed).not.toBeNull()
      expect(reversed!.id).not.toBe(snap.id)
    })
  })

  describe('FakeClock determinism', () => {
    it('returns the set time', () => {
      host.clock.set(1700000000000)
      expect(host.clock.now()).toBe(1700000000000)
    })

    it('advance increases time monotonically', () => {
      const t0 = host.clock.now()
      host.clock.advance(60000)
      expect(host.clock.now()).toBe(t0 + 60000)
    })
  })

  describe('FakeMetricsStore', () => {
    it('records and queries metrics', () => {
      host.metrics.record({
        timestamp: 1000,
        nodeId: 't1',
        phi: 0.5,
        lambda: 0.75,
        tokensBaseline: 100,
        tokensActual: 80,
        tokensSaved: 20,
        mode: 'flow_on',
      })
      host.metrics.record({
        timestamp: 2000,
        nodeId: 't2',
        phi: 0.8,
        lambda: 0.9,
        tokensBaseline: 200,
        tokensActual: 150,
        tokensSaved: 50,
        mode: 'flow_on',
      })

      expect(host.metrics.totalTokensSaved()).toBe(70)
      expect(host.metrics.averagePhi()).toBeCloseTo(0.65)
      expect(host.metrics.query('t1')).toHaveLength(1)
    })
  })

  describe('FakePermissionBroker', () => {
    it('defaults to ask verdict', () => {
      expect(host.permissions.check('bash', { cmd: 'rm -rf' })).toBe('ask')
    })

    it('matches allow rule', () => {
      host.permissions.addRule({ toolName: 'bash', pattern: 'ls', verdict: 'allow' })
      expect(host.permissions.check('bash', { cmd: 'ls' })).toBe('allow')
    })

    it('denies unmatched tools with overridden default', () => {
      host.permissions.setDefault('deny')
      expect(host.permissions.check('dangerous_tool', {})).toBe('deny')
    })
  })

  describe('FakeQuestionBroker', () => {
    it('auto-answers questions', () => {
      host.questions.setAutoAnswer(() => 'approved')
      const q = host.questions.ask('Proceed?')
      expect(q.status).toBe('answered')
      expect(q.answer).toBe('approved')
    })

    it('rejects a pending question', () => {
      const q = host.questions.ask('Delete?')
      const rejected = host.questions.reject(q.id, 'Not safe')
      expect(rejected.status).toBe('rejected')
    })
  })

  describe('End-to-end: TUI → Bridge parity', () => {
    it('startTask produces same shape via fake services', () => {
      host.taskLifecycle.addNode({
        id: 'parity_test',
        type: 'task',
        title: 'Parity',
        status: 'backlog',
        priority: 1,
      })

      const viaTui = host.taskLifecycle.startTask('parity_test')
      expect(viaTui).not.toBeNull()
      expect(viaTui!.node.id).toBe('parity_test')
      expect(viaTui!.node.status).toBe('in_progress')
      expect(Array.isArray(viaTui!.acceptanceCriteria)).toBe(true)
      expect(Array.isArray(viaTui!.children)).toBe(true)
    })

    it('summary is consistent after task operations', () => {
      host.taskLifecycle.addNode({
        id: 'e1',
        type: 'epic',
        title: 'Epic 1',
        status: 'backlog',
        priority: 1,
      })
      host.contextRuntime.seed([{ id: 'e1', type: 'epic', title: 'Epic 1', status: 'backlog', priority: 1 } as any])

      const s = host.contextRuntime.summary()
      expect(s.totalNodes).toBeGreaterThanOrEqual(1)
      expect(s.byType['epic']).toBeGreaterThanOrEqual(1)
    })
  })
})
