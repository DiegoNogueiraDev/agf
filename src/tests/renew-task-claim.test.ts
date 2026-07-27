/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes do renewTaskClaim (node_728743c96bd9) — wire do LockManager.renew
 * (dormente) para o dono renovar a própria lease via comandos que tocam o node.
 * Risco mitigado: TTL 300s expira no meio de qualquer task TDD
 * (risk node_cf74a021bb25).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { LockManager } from '../core/store/lock-manager.js'
import { claimNextTask } from '../core/planner/claim-next-task.js'
import { renewTaskClaim } from '../core/planner/renew-task-claim.js'
import type { GraphDocument, GraphNode } from '../core/graph/graph-types.js'

function makeDoc(nodes: object[]): GraphDocument {
  return {
    version: '1',
    project: { id: 'p1', name: 'test', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    nodes: nodes as GraphNode[],
    edges: [],
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  } as unknown as GraphDocument
}

function task(id: string): object {
  return {
    id,
    type: 'task',
    title: `Task ${id}`,
    status: 'backlog',
    priority: 2,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }
}

describe('renewTaskClaim — o dono renova a própria lease (LockManager.renew wirado)', () => {
  let db: Database.Database
  let locks: LockManager

  beforeEach(() => {
    db = new Database(':memory:')
    configureDb(db)
    runMigrations(db)
    locks = new LockManager(db)
  })

  afterEach(() => db.close())

  function claimT1(agent: string): string {
    const claimed = claimNextTask(makeDoc([task('t1')]), locks, agent, { ttlSeconds: 60 })
    expect(claimed).not.toBeNull()
    return claimed!.claim.expiresAt
  }

  it('AC1: o dono renova — expiresAt avança (novo > anterior)', () => {
    const before = claimT1('formiga-a')

    const result = renewTaskClaim(db, 't1', 'formiga-a', 300)

    expect(result.renewed).toBe(true)
    expect(result.mismatch).toBe(false)
    expect(result.expiresAt).toBeDefined()
    expect(new Date(result.expiresAt!).getTime()).toBeGreaterThan(new Date(before).getTime())
  })

  it('AC2: outra formiga NÃO renova lease alheia — mismatch com dono nomeado, expiresAt intacto', () => {
    const before = claimT1('formiga-a')

    const result = renewTaskClaim(db, 't1', 'formiga-b', 300)

    expect(result.renewed).toBe(false)
    expect(result.mismatch).toBe(true)
    expect(result.agentId).toBe('formiga-a')
    const row = db.prepare("SELECT expires_at FROM resource_locks WHERE resource_id = 'task:t1'").get() as {
      expires_at: string
    }
    expect(row.expires_at).toBe(before)
  })

  it('AC3: sem identidade, nenhum renew ocorre (comportamento atual byte-idêntico)', () => {
    const before = claimT1('formiga-a')

    const result = renewTaskClaim(db, 't1', undefined, 300)

    expect(result.renewed).toBe(false)
    expect(result.mismatch).toBe(false)
    const row = db.prepare("SELECT expires_at FROM resource_locks WHERE resource_id = 'task:t1'").get() as {
      expires_at: string
    }
    expect(row.expires_at).toBe(before)
  })

  it('sem lease viva para o node, renew é no-op limpo (não lança)', () => {
    const result = renewTaskClaim(db, 'inexistente', 'formiga-a', 300)
    expect(result.renewed).toBe(false)
    expect(result.mismatch).toBe(false)
  })

  it('lease EXPIRADA não é renovada — expirou, virou terra de ninguém (claim novo, não renew)', () => {
    // Lease com TTL negativo (já nasce expirada) via acquire direto.
    locks.acquire('task:t1', 'formiga-a', -1)
    const result = renewTaskClaim(db, 't1', 'formiga-a', 300)
    expect(result.renewed).toBe(false)
  })
})
