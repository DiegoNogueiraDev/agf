import { describe, it, expect, vi } from 'vitest'
import type { DoDCheck, DoDReport, TaskLifecycleService } from '../core/contracts/task-lifecycle.js'

describe('DoDCheck type contract', () => {
  it('required check shape', () => {
    const check: DoDCheck = {
      name: 'has_acceptance_criteria',
      severity: 'required',
      passed: true,
      detail: 'AC found in node',
    }
    expect(check.name).toBe('has_acceptance_criteria')
    expect(check.severity).toBe('required')
    expect(check.passed).toBe(true)
  })

  it('recommended check shape', () => {
    const check: DoDCheck = {
      name: 'has_description',
      severity: 'recommended',
      passed: false,
      detail: 'No description set',
    }
    expect(check.severity).toBe('recommended')
    expect(check.passed).toBe(false)
  })

  it('severity is optional', () => {
    const check: DoDCheck = { name: 'custom', passed: true, detail: 'ok' }
    expect(check.severity).toBeUndefined()
  })
})

describe('DoDReport type contract', () => {
  it('passes reflect total checks', () => {
    const report: DoDReport = {
      nodeId: 'node_abc',
      title: 'Fix the thing',
      checks: [
        { name: 'a', severity: 'required', passed: true, detail: '' },
        { name: 'b', severity: 'required', passed: false, detail: '' },
      ],
      passed: 1,
      total: 2,
      ready: false,
    }
    expect(report.passed).toBe(1)
    expect(report.total).toBe(2)
    expect(report.ready).toBe(false)
  })

  it('includes epicPromotion when all children are done', () => {
    const report: DoDReport = {
      nodeId: 'node_last',
      title: 'Final subtask',
      checks: [],
      passed: 0,
      total: 0,
      ready: true,
      epicPromotion: { parentId: 'epic_1', parentTitle: 'The Epic', allChildrenDone: true },
    }
    expect(report.epicPromotion?.allChildrenDone).toBe(true)
    expect(report.epicPromotion?.parentId).toBe('epic_1')
  })

  it('epicPromotion is optional', () => {
    const report: DoDReport = { nodeId: 'n', title: 't', checks: [], passed: 0, total: 0, ready: false }
    expect(report.epicPromotion).toBeUndefined()
  })
})

describe('TaskLifecycleService stub', () => {
  it('satisfies the full contract', () => {
    const stub: TaskLifecycleService = {
      startTask: vi.fn(() => null),
      finishTask: vi.fn(() => ({ nodeId: 'n', title: 't', checks: [], passed: 0, total: 0, ready: false })),
      updateStatus: vi.fn(() => null),
      findNext: vi.fn(() => null),
    }
    expect(stub.findNext()).toBeNull()
    expect(stub.startTask()).toBeNull()
    expect(stub.startTask('node_abc')).toBeNull()
    const report = stub.finishTask('node_abc', 'done', [])
    expect(report.nodeId).toBe('n')
    expect(stub.updateStatus('node_abc', 'done')).toBeNull()
  })
})
