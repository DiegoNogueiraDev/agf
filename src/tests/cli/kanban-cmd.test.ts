/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../../core/store/sqlite-store.js'
import { buildBoard, boardSuggestions, kanbanCommand } from '../../cli/commands/kanban-cmd.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function seed(store: SqliteStore, id: string, title: string, status: string): void {
  const now = new Date().toISOString()
  store.insertNode({
    id,
    type: 'task',
    title,
    description: '',
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

describe('kanban-cmd — conecta core/kanban/buildKanbanBoard', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('test-project')
    seed(store, 't1', 'Done one', 'done')
    seed(store, 't2', 'WIP one', 'in_progress')
    seed(store, 't3', 'WIP two', 'in_progress')
    seed(store, 't4', 'Backlog one', 'backlog')
  })

  afterEach(() => {
    store.close()
  })

  it('constrói colunas por status com os cards alocados', () => {
    const board = buildBoard(store)
    expect(board.columns.length).toBeGreaterThan(0)
    const wip = board.columns.find((c) => c.status === 'in_progress')
    expect(wip).toBeDefined()
    expect(wip!.cards.length).toBe(2)
    const done = board.columns.find((c) => c.status === 'done')
    expect(done!.cards.length).toBe(1)
  })

  it('expõe métricas de fluxo reais', () => {
    const board = buildBoard(store)
    expect(board.metrics).toHaveProperty('throughput')
    expect(board.metrics).toHaveProperty('avgCycleTime')
    expect(Array.isArray(board.metrics.wipViolations)).toBe(true)
  })

  it('swimlane por epic produz swimlanes', () => {
    const board = buildBoard(store, 'epic')
    expect(Array.isArray(board.swimlanes)).toBe(true)
  })

  it('boardSuggestions surfaces a start_next suggestion for the recommended task (node_wire_edbfc4d5d917)', () => {
    const board = buildBoard(store)
    const suggestions = boardSuggestions(store, board)
    expect(Array.isArray(suggestions)).toBe(true)
    expect(suggestions.some((s) => s.action === 'start_next')).toBe(true)
  })

  it('filters cards by sprint when a sprintId is passed (node_wire_077465b117f0 — kanban/validation.ts wire)', () => {
    const now = new Date().toISOString()
    store.insertNode({
      id: 't5',
      type: 'task',
      title: 'Sprint one task',
      description: '',
      status: 'backlog' as never,
      priority: 3,
      xpSize: 'S',
      parentId: null,
      acceptanceCriteria: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
      metadata: {},
      sprint: 'sprint-1',
    } as never)

    const board = buildBoard(store, 'none', 'sprint-1')
    const totalCards = board.columns.reduce((sum, c) => sum + c.cards.length, 0)
    expect(totalCards).toBe(1)
    expect(board.columns.some((c) => c.cards.some((card) => card.node.id === 't5'))).toBe(true)
  })
})

describe('kanban validate-move (node_wire_f0df4daa31c0 — kanban-validator wire)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  async function run(args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const proc = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await kanbanCommand().parseAsync(args, { from: 'user' })
    } finally {
      process.stdout.write = proc
    }
    return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
  }

  it('advises unresolved-dependency warning when moving a task to done with an unfinished dependency', async () => {
    const { SqliteStore: Store } = await import('../../core/store/sqlite-store.js')
    dir = mkdtempSync(join(tmpdir(), 'agf-kanban-validate-'))
    const s = Store.open(dir)
    s.initProject('kanban-validate-test')
    const now = new Date().toISOString()
    s.insertNode({
      id: 'dep1',
      type: 'task',
      title: 'Dependency',
      status: 'backlog',
      priority: 3,
      createdAt: now,
      updatedAt: now,
    } as never)
    s.insertNode({
      id: 'target',
      type: 'task',
      title: 'Target',
      status: 'in_progress',
      priority: 3,
      createdAt: now,
      updatedAt: now,
    } as never)
    s.insertEdge({ id: 'e1', from: 'target', to: 'dep1', relationType: 'depends_on', createdAt: now })
    s.close()

    const envelope = await run(['validate-move', 'target', 'done', '-d', dir])
    expect(envelope.ok).toBe(true)
    const data = envelope.data as { success: boolean; warnings: string[] }
    expect(data.success).toBe(true)
    expect(data.warnings.some((w) => w.includes('unresolved dependencies'))).toBe(true)
  })

  it('returns success=false for a node that does not exist', async () => {
    const { SqliteStore: Store } = await import('../../core/store/sqlite-store.js')
    dir = mkdtempSync(join(tmpdir(), 'agf-kanban-validate-missing-'))
    const s = Store.open(dir)
    s.initProject('kanban-validate-missing-test')
    s.close()

    const envelope = await run(['validate-move', 'ghost', 'done', '-d', dir])
    expect(envelope.ok).toBe(true)
    expect((envelope.data as { success: boolean }).success).toBe(false)
  })
})

describe('kanban --sprint (node_wire_077465b117f0 — kanban/validation.ts wire)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  async function run(args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const proc = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await kanbanCommand().parseAsync(args, { from: 'user' })
    } finally {
      process.stdout.write = proc
    }
    return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
  }

  it('restricts the board to cards from the given sprint', async () => {
    const { SqliteStore: Store } = await import('../../core/store/sqlite-store.js')
    dir = mkdtempSync(join(tmpdir(), 'agf-kanban-sprint-'))
    const s = Store.open(dir)
    s.initProject('kanban-sprint-test')
    const now = new Date().toISOString()
    s.insertNode({
      id: 'in-sprint',
      type: 'task',
      title: 'In sprint',
      status: 'backlog',
      priority: 3,
      createdAt: now,
      updatedAt: now,
      sprint: 'sprint-1',
    } as never)
    s.insertNode({
      id: 'other-sprint',
      type: 'task',
      title: 'Other sprint',
      status: 'backlog',
      priority: 3,
      createdAt: now,
      updatedAt: now,
      sprint: 'sprint-2',
    } as never)
    s.close()

    const envelope = await run(['--sprint', 'sprint-1', '-d', dir])
    expect(envelope.ok).toBe(true)
    const board = (envelope.data as { board: { columns: { cards: { node: { id: string } }[] }[] } }).board
    const ids = board.columns.flatMap((c) => c.cards.map((card) => card.node.id))
    expect(ids).toEqual(['in-sprint'])
  })
})
