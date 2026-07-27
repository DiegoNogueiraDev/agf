import { describe, it, expect, vi } from 'vitest'
import type { GraphSummary, NodeDetail, ContextRuntimeService } from '../core/contracts/context-runtime.js'

describe('ContextRuntimeService contract types', () => {
  it('GraphSummary shape is correct', () => {
    const summary: GraphSummary = {
      byType: { task: 5, epic: 1 },
      byStatus: { done: 3, backlog: 3 },
      totalNodes: 6,
      nextTask: { id: 'node_abc', title: 'Next task' },
    }
    expect(summary.totalNodes).toBe(6)
    expect(summary.byType['task']).toBe(5)
    expect(summary.nextTask?.id).toBe('node_abc')
  })

  it('GraphSummary nextTask can be null', () => {
    const summary: GraphSummary = {
      byType: {},
      byStatus: {},
      totalNodes: 0,
      nextTask: null,
    }
    expect(summary.nextTask).toBeNull()
    expect(summary.totalNodes).toBe(0)
  })

  it('NodeDetail shape is correct', () => {
    const detail: NodeDetail = {
      node: {
        id: 'n1',
        type: 'task',
        title: 'Task',
        status: 'backlog',
        priority: 1,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      } as never,
      childrenCount: 2,
      parentTitle: 'Epic One',
      edgeCount: 3,
    }
    expect(detail.childrenCount).toBe(2)
    expect(detail.edgeCount).toBe(3)
    expect(detail.parentTitle).toBe('Epic One')
  })

  it('NodeDetail parentTitle is optional', () => {
    const detail: NodeDetail = {
      node: {} as never,
      childrenCount: 0,
      edgeCount: 0,
    }
    expect(detail.parentTitle).toBeUndefined()
  })
})

describe('ContextRuntimeService stub', () => {
  it('stub satisfies the full contract', () => {
    const stub: ContextRuntimeService = {
      compact: vi.fn(() => null),
      summary: vi.fn(() => ({ byType: {}, byStatus: {}, totalNodes: 0, nextTask: null })),
      nodeDetail: vi.fn(() => null),
      children: vi.fn(() => []),
      backlog: vi.fn(() => []),
    }

    expect(stub.summary().totalNodes).toBe(0)
    expect(stub.compact('node_1')).toBeNull()
    expect(stub.nodeDetail('node_1')).toBeNull()
    expect(stub.children('node_1')).toEqual([])
    expect(stub.backlog()).toEqual([])
  })

  it('stub summary returns correct GraphSummary shape', () => {
    const stub: ContextRuntimeService = {
      compact: vi.fn(() => null),
      summary: vi.fn(() => ({ byType: { task: 2 }, byStatus: { done: 1 }, totalNodes: 2, nextTask: null })),
      nodeDetail: vi.fn(() => null),
      children: vi.fn(() => []),
      backlog: vi.fn(() => []),
    }
    const s = stub.summary()
    expect(s.byType['task']).toBe(2)
  })
})
