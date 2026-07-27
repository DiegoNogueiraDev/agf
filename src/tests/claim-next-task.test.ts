/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { LockManager } from '../core/store/lock-manager.js'
import { claimNextTask } from '../core/planner/claim-next-task.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeDoc(nodes: object[], edges: object[] = []): GraphDocument {
  return {
    version: '1',
    project: { id: 'p1', name: 'test', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    nodes,
    edges,
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  } as unknown as GraphDocument
}

function task(id: string, priority: number, touchedFiles?: string[]): object {
  return {
    id,
    type: 'task',
    title: `Task ${id}`,
    status: 'backlog',
    priority,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...(touchedFiles ? { metadata: { touchedFiles } } : {}),
  }
}

function createDb(): Database.Database {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  return db
}

describe('claimNextTask — atomic lease-based claim', () => {
  let db: Database.Database
  let locks: LockManager

  beforeEach(() => {
    db = createDb()
    locks = new LockManager(db)
  })

  afterEach(() => db.close())

  it('AC1: two distinct agents claim different tasks (no double-pull)', () => {
    const doc = makeDoc([task('t1', 1), task('t2', 2)])
    const a = claimNextTask(doc, locks, 'agent-A')
    const b = claimNextTask(doc, locks, 'agent-B')
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(a!.node.id).not.toBe(b!.node.id)
    expect(new Set([a!.node.id, b!.node.id])).toEqual(new Set(['t1', 't2']))
  })

  it('AC2: agent B skips a task already claimed by A and returns the next unclaimed', () => {
    const doc = makeDoc([task('t1', 1), task('t2', 2)])
    const a = claimNextTask(doc, locks, 'agent-A')
    const b = claimNextTask(doc, locks, 'agent-B')
    expect(b!.node.id).not.toBe(a!.node.id)
  })

  it('AC2: agent B gets NO_TASKS (null) when the only task is already claimed', () => {
    const doc = makeDoc([task('t1', 1)])
    const a = claimNextTask(doc, locks, 'agent-A')
    expect(a!.node.id).toBe('t1')
    const b = claimNextTask(doc, locks, 'agent-B')
    expect(b).toBeNull()
  })

  it('AC3: a successful claim returns claim.leaseToken and claim.expiresAt', () => {
    const doc = makeDoc([task('t1', 1)])
    const a = claimNextTask(doc, locks, 'agent-A')
    expect(a!.claim.leaseToken).toBeTruthy()
    expect(a!.claim.agentId).toBe('agent-A')
    expect(new Date(a!.claim.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('returns null on an empty graph (NO_TASKS)', () => {
    expect(claimNextTask(makeDoc([]), locks, 'agent-A')).toBeNull()
  })

  it('is idempotent for the same agent re-claiming (lease upgrade, same task)', () => {
    const doc = makeDoc([task('t1', 1)])
    const first = claimNextTask(doc, locks, 'agent-A')
    const again = claimNextTask(doc, locks, 'agent-A')
    expect(again!.node.id).toBe(first!.node.id)
  })

  it('lets another agent claim a task whose lease has expired', () => {
    const doc = makeDoc([task('t1', 1)])
    // ttl <= 0 → lease is born already-expired (LockManager idiom).
    const a = claimNextTask(doc, locks, 'agent-A', { ttlSeconds: -1 })
    expect(a!.node.id).toBe('t1')
    const b = claimNextTask(doc, locks, 'agent-B')
    expect(b!.node.id).toBe('t1') // reclaimed after expiry
  })

  // REQ-LCR-003: WIP>1 (multi-agent) is only safe
  // when concurrent tasks share no files — the "Petri-net token model".
  describe('REQ-LCR-003: in-flight file-overlap exclusion', () => {
    it('skips a backlog task whose touchedFiles overlap a lease held by another agent', () => {
      const doc = makeDoc([
        task('t1', 1, ['src/shared.ts']),
        task('t2', 2, ['src/shared.ts']),
        task('t3', 3, ['src/other.ts']),
      ])
      const a = claimNextTask(doc, locks, 'agent-A')
      expect(a!.node.id).toBe('t1')

      const b = claimNextTask(doc, locks, 'agent-B')
      // t2 has higher priority than t3 but shares src/shared.ts with agent-A's t1.
      expect(b!.node.id).toBe('t3')
    })

    it("does not exclude a task on the claiming agent's own in-flight files", () => {
      const doc = makeDoc([task('t1', 1, ['src/shared.ts'])])
      const first = claimNextTask(doc, locks, 'agent-A')
      const again = claimNextTask(doc, locks, 'agent-A')
      expect(first!.node.id).toBe('t1')
      expect(again!.node.id).toBe('t1')
    })

    it('behavior is unchanged when no task declares touchedFiles', () => {
      const doc = makeDoc([task('t1', 1), task('t2', 2)])
      const a = claimNextTask(doc, locks, 'agent-A')
      const b = claimNextTask(doc, locks, 'agent-B')
      expect(new Set([a!.node.id, b!.node.id])).toEqual(new Set(['t1', 't2']))
    })
  })

  // node_a268188b9c2e — a fronteira entre formigas são os arquivos DECLARADOS
  // (implementationFiles + testFiles + metadata.touchedFiles), e vale também para
  // in_progress com dono (claimedBy) cuja lease já expirou — o status é o
  // feromônio durável, não a lease.
  describe('node_a268188b9c2e: fronteira por arquivos declarados de in_progress alheios', () => {
    function inProgressOwned(id: string, claimedBy: string, implementationFiles?: string[]): object {
      return {
        id,
        type: 'task',
        title: `Task ${id}`,
        status: 'in_progress',
        priority: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        metadata: { claimedBy },
        ...(implementationFiles ? { implementationFiles } : {}),
      }
    }

    function backlogWithImpl(id: string, priority: number, implementationFiles: string[]): object {
      return { ...task(id, priority), implementationFiles }
    }

    it('AC1: in_progress alheio com implementationFiles e lease EXPIRADA ainda exclui candidata com overlap', () => {
      const doc = makeDoc([
        inProgressOwned('voo-a', 'agent-A', ['src/x.ts']),
        backlogWithImpl('candidata', 1, ['src/x.ts']),
        backlogWithImpl('limpa', 2, ['src/y.ts']),
      ])
      // Nenhuma lease criada para voo-a — simula lease expirada; só o status protege.
      const b = claimNextTask(doc, locks, 'agent-B')
      expect(b!.node.id).toBe('limpa')
    })

    it('AC2: sem overlap de arquivos, o claim segue normal (mesma candidata de antes)', () => {
      const doc = makeDoc([
        inProgressOwned('voo-a', 'agent-A', ['src/x.ts']),
        backlogWithImpl('candidata', 1, ['src/y.ts']),
      ])
      const b = claimNextTask(doc, locks, 'agent-B')
      expect(b!.node.id).toBe('candidata')
    })

    it('AC3: in_progress alheio SEM arquivos declarados não bloqueia nenhuma candidata', () => {
      const doc = makeDoc([inProgressOwned('voo-a', 'agent-A'), backlogWithImpl('candidata', 1, ['src/x.ts'])])
      const b = claimNextTask(doc, locks, 'agent-B')
      expect(b!.node.id).toBe('candidata')
    })

    it('a própria formiga não se auto-bloqueia pelos arquivos do seu in_progress', () => {
      const doc = makeDoc([
        inProgressOwned('voo-a', 'agent-A', ['src/x.ts']),
        backlogWithImpl('candidata', 1, ['src/x.ts']),
      ])
      const a = claimNextTask(doc, locks, 'agent-A')
      expect(a!.node.id).toBe('candidata')
    })

    it('testFiles declarados também contam como fronteira (união, não só implementationFiles)', () => {
      const doc = makeDoc([
        { ...inProgressOwned('voo-a', 'agent-A'), testFiles: ['src/tests/x.test.ts'] },
        { ...task('candidata', 1), testFiles: ['src/tests/x.test.ts'] },
        backlogWithImpl('limpa', 2, ['src/y.ts']),
      ])
      const b = claimNextTask(doc, locks, 'agent-B')
      expect(b!.node.id).toBe('limpa')
    })
  })

  describe('node_22361e1331e3: nunca reivindica uma task com depends_on não-resolvido', () => {
    it('BUG3: todas as elegíveis bloqueadas → retorna null (não reivindica a menos-bloqueada)', () => {
      // 'A' (backlog, elegível) depends_on 'B' (in_progress → não-elegível e não-done).
      // findNextTask devolve A com warning all_tasks_blocked; o claim NÃO pode entregá-la.
      const doc = makeDoc(
        [task('A', 2), { ...task('B', 2), status: 'in_progress' }],
        [{ id: 'e1', from: 'A', to: 'B', relationType: 'depends_on' }],
      )
      const result = claimNextTask(doc, locks, 'ant-1')
      expect(result).toBeNull()
    })

    it('anti-Goodhart: existindo uma elegível DESBLOQUEADA ao lado de bloqueadas, reivindica a desbloqueada', () => {
      // 'A' depends_on 'B' (in_progress); 'C' é backlog sem deps → deve ser reivindicada.
      const doc = makeDoc(
        [task('A', 2), { ...task('B', 2), status: 'in_progress' }, task('C', 3)],
        [{ id: 'e1', from: 'A', to: 'B', relationType: 'depends_on' }],
      )
      const result = claimNextTask(doc, locks, 'ant-1')
      expect(result?.node.id).toBe('C')
    })
  })
})
