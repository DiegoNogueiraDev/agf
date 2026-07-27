/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Tests for Task 4.3: Distinguish no-tasks reasons in next CLI output.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { GraphDocument, GraphNode } from '../core/graph/graph-types.js'

function nodeBase(overrides: Partial<GraphNode>): GraphNode {
  return {
    id: 'n1',
    type: 'task',
    title: 'Test task',
    status: 'backlog',
    priority: 1,
    blocked: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as GraphNode
}

describe('findNextTask no-tasks reason codes', () => {
  it('returns null with reason empty_graph when no task/subtask nodes exist', async () => {
    const { findNextTask } = await import('../core/planner/next-task.js')
    const doc: GraphDocument = {
      nodes: [nodeBase({ id: 'e1', type: 'epic', status: 'backlog' })],
      edges: [],
    }
    const result = findNextTask(doc)
    expect(result).toBeNull()
  })

  it('returns null when all tasks are explicitly blocked', async () => {
    const { findNextTask } = await import('../core/planner/next-task.js')
    const doc: GraphDocument = {
      nodes: [
        nodeBase({ id: 'n1', type: 'task', status: 'backlog', blocked: true }),
        nodeBase({ id: 'n2', type: 'task', status: 'backlog', blocked: true }),
      ],
      edges: [],
    }
    const result = findNextTask(doc)
    expect(result).toBeNull()
  })
})

describe('next-cmd NO_TASKS reason enrichment', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>
  let captured: string[]
  // AGF_AGENT_ID vazando do shell (sessão-formiga) ativa o caminho de claim do
  // next-cmd, que exige um LockManager real — o stub daqui não tem .all e o
  // teste explode fora do cenário sob teste (node_a7f4fdc20791). Sanitizar
  // espelha next-cmd.test.ts, que salva/deleta/restaura a env.
  const originalAgentId = process.env.AGF_AGENT_ID

  beforeEach(() => {
    delete process.env.AGF_AGENT_ID
    captured = []
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      captured.push(typeof chunk === 'string' ? chunk : chunk.toString())
      return true
    })
  })

  afterEach(() => {
    if (originalAgentId === undefined) delete process.env.AGF_AGENT_ID
    else process.env.AGF_AGENT_ID = originalAgentId
    stdoutSpy.mockRestore()
    vi.resetModules()
  })

  it('NO_TASKS output contains reason field with a string value', async () => {
    vi.doMock('../core/store/sqlite-store.js', () => ({
      SqliteStore: vi.fn(() => ({
        toGraphDocument: () => ({
          nodes: [],
          edges: [],
        }),
        close: vi.fn(),
      })),
    }))
    vi.doMock('../cli/open-store.js', () => ({
      openStoreOrFail: () => ({
        toGraphDocument: () => ({ nodes: [], edges: [] }),
        getDb: () => ({ prepare: () => ({ get: () => undefined, all: () => [], run: () => undefined }) }),
        close: vi.fn(),
      }),
    }))
    const { nextCommand } = await import('../cli/commands/next-cmd.js')
    const cmd = nextCommand()
    await cmd.parseAsync(['node', 'test', '--dir', process.cwd()])
    expect(captured.length).toBeGreaterThan(0)
    const envelope = JSON.parse(captured[0].trim())
    // Should be err or advisory with a reason
    expect(envelope.code).toBe('NO_TASKS')
    expect(typeof envelope.data?.reason).toBe('string')
  })

  it('NO_TASKS output enumerates external/infra blockers for human action', async () => {
    const infraNode = {
      id: 'infra1',
      type: 'task',
      title: 'migrate address domain',
      status: 'backlog',
      blocked: true,
      priority: 3,
      metadata: { blockReason: 'push blocked by corporate proxy (SSH timeout)' },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }
    vi.doMock('../cli/open-store.js', () => ({
      openStoreOrFail: () => ({
        toGraphDocument: () => ({ nodes: [infraNode], edges: [] }),
        getDb: () => ({ prepare: () => ({ get: () => undefined, all: () => [], run: () => undefined }) }),
        getProject: () => ({ id: 'p1' }),
        getStats: () => ({}),
        close: vi.fn(),
      }),
    }))
    const { nextCommand } = await import('../cli/commands/next-cmd.js')
    const cmd = nextCommand()
    await cmd.parseAsync(['node', 'test', '--dir', process.cwd()])
    const envelope = JSON.parse(captured[0].trim())
    expect(envelope.code).toBe('NO_TASKS')
    expect(Array.isArray(envelope.data?.externalBlocks)).toBe(true)
    expect(envelope.data.externalBlocks[0].nodeId).toBe('infra1')
    expect(envelope.data.externalBlocks[0].requiredAction).toMatch(/human|infra/i)
  })
})
