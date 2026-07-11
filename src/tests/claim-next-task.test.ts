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
})
