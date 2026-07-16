/*!
 * TDD: agf claims — visibility command listing active leases (node_b7d9f5c65685).
 *
 * AC1: Given 2 active claims, agf claims lists each with resourceId, agentId, expiresAt.
 * AC2: Output honors JSON envelope contract (ok, data, meta.command).
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { LockManager } from '../core/store/lock-manager.js'
import { listActiveClaims } from '../core/store/lock-manager.js'

function makeDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS resource_locks (
      resource_id TEXT PRIMARY KEY,
      resource_type TEXT NOT NULL DEFAULT 'task',
      agent_id TEXT NOT NULL,
      lease_token TEXT NOT NULL UNIQUE,
      acquired_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )
  `)
  return db
}

describe('AC1: listActiveClaims returns active leases with required fields', () => {
  it('returns 2 rows when 2 active claims exist', () => {
    const db = makeDb()
    const lm = new LockManager(db)
    lm.acquire('task-A', 'agent-1', 300)
    lm.acquire('task-B', 'agent-2', 300)

    const claims = listActiveClaims(db)
    expect(claims).toHaveLength(2)
    const ids = claims.map((c) => c.resourceId).sort()
    expect(ids).toEqual(['task-A', 'task-B'])
    // Each row must have the required fields
    for (const c of claims) {
      expect(c).toHaveProperty('resourceId')
      expect(c).toHaveProperty('agentId')
      expect(c).toHaveProperty('expiresAt')
    }
  })

  it('returns empty array when no active claims', () => {
    const db = makeDb()
    expect(listActiveClaims(db)).toHaveLength(0)
  })

  it('excludes expired leases', () => {
    const db = makeDb()
    const lm = new LockManager(db)
    lm.acquire('task-live', 'agent-A', 300)
    // Insert expired lease directly
    const past = new Date(Date.now() - 5_000).toISOString()
    db.prepare(
      `INSERT INTO resource_locks (resource_id, resource_type, agent_id, lease_token, acquired_at, expires_at)
       VALUES (?, 'task', 'agent-B', 'tok-exp', ?, ?)`,
    ).run('task-expired', past, past)

    const claims = listActiveClaims(db)
    expect(claims).toHaveLength(1)
    expect(claims[0]!.resourceId).toBe('task-live')
  })
})

// node_4248646d3d7f — visão da colônia: agentes, tasks em voo, arquivos
// declarados e overlaps par-a-par, unindo leases vivas E in_progress com dono
// (a lease expira; o claimedBy fica).
describe('buildColonyView — agf claims --colony', () => {
  function ant(id: string, claimedBy: string, files: string[]): object {
    return {
      id,
      type: 'task',
      title: `Task ${id}`,
      status: 'in_progress',
      priority: 2,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      metadata: { claimedBy },
      implementationFiles: files,
    }
  }

  it('AC1: 2 formigas com arquivos disjuntos → 2 entradas {agentId, taskId, files} e overlaps vazio', async () => {
    const { buildColonyView } = await import('../cli/commands/claims-cmd.js')
    const nodes = [ant('ta', 'formiga-a', ['src/a.ts']), ant('tb', 'formiga-b', ['src/b.ts'])]

    const view = buildColonyView(nodes as never, [])

    expect(view.colony).toHaveLength(2)
    const byAgent = Object.fromEntries(view.colony.map((c) => [c.agentId, c]))
    expect(byAgent['formiga-a'].taskId).toBe('ta')
    expect(byAgent['formiga-a'].files).toEqual(['src/a.ts'])
    expect(byAgent['formiga-b'].taskId).toBe('tb')
    expect(view.overlaps).toEqual([])
  })

  it('AC2: arquivo declarado por AMBAS → overlaps nomeia o arquivo e os 2 agentIds', async () => {
    const { buildColonyView } = await import('../cli/commands/claims-cmd.js')
    const nodes = [ant('ta', 'formiga-a', ['src/shared.ts']), ant('tb', 'formiga-b', ['src/shared.ts'])]

    const view = buildColonyView(nodes as never, [])

    expect(view.overlaps).toHaveLength(1)
    expect(view.overlaps[0].file).toBe('src/shared.ts')
    expect(new Set(view.overlaps[0].agents)).toEqual(new Set(['formiga-a', 'formiga-b']))
  })

  it('AC3: nenhuma formiga ativa → colony [] (não erro)', async () => {
    const { buildColonyView } = await import('../cli/commands/claims-cmd.js')
    const view = buildColonyView([], [])
    expect(view.colony).toEqual([])
    expect(view.overlaps).toEqual([])
  })

  it('lease viva sem claimedBy no node também aparece (fonte: lock), com expiresAt anexado', async () => {
    const { buildColonyView } = await import('../cli/commands/claims-cmd.js')
    const nodes = [
      {
        id: 'tc',
        type: 'task',
        title: 'Task tc',
        status: 'backlog',
        priority: 2,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        implementationFiles: ['src/c.ts'],
      },
    ]
    const claims = [
      {
        resourceId: 'task:tc',
        resourceType: 'task',
        agentId: 'formiga-c',
        leaseToken: 'tok',
        acquiredAt: '2026-01-01T00:00:00Z',
        expiresAt: '2099-01-01T00:00:00Z',
      },
    ]

    const view = buildColonyView(nodes as never, claims)

    expect(view.colony).toHaveLength(1)
    expect(view.colony[0].agentId).toBe('formiga-c')
    expect(view.colony[0].taskId).toBe('tc')
    expect(view.colony[0].lease?.expiresAt).toBe('2099-01-01T00:00:00Z')
    expect(view.colony[0].files).toEqual(['src/c.ts'])
  })
})
