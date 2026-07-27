/*!
 * Task node_58663051cc10 — agf done releases caller's claim lease.
 *
 * AC1: Given an agent holds a claim and runs agf done <id>, when it completes,
 *      then the lease for that resource is released (sweep reports it gone).
 * AC2: Given agf done <id> on a task claimed by a different agent, when run,
 *      then it warns CLAIM_MISMATCH and proceeds (override-able).
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { LockManager } from '../core/store/lock-manager.js'
import { releaseTaskClaim, type ReleaseClaimResult } from '../core/planner/release-task-claim.js'

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

describe('releaseTaskClaim', () => {
  it('releases the lease when agent matches (AC1)', () => {
    const db = makeDb()
    const lm = new LockManager(db)
    lm.acquire('task_1', 'agent-A')
    const result: ReleaseClaimResult = releaseTaskClaim(db, 'task_1', 'agent-A')
    expect(result.released).toBe(true)
    expect(result.mismatch).toBe(false)
    // Verify row is gone
    const row = db.prepare('SELECT * FROM resource_locks WHERE resource_id = ?').get('task_1')
    expect(row).toBeUndefined()
  })

  it('returns mismatch=true when different agent (AC2)', () => {
    const db = makeDb()
    const lm = new LockManager(db)
    lm.acquire('task_2', 'agent-B')
    const result = releaseTaskClaim(db, 'task_2', 'agent-A')
    expect(result.mismatch).toBe(true)
    // Row still present — not released by default
  })

  it('returns released=false when no claim exists', () => {
    const db = makeDb()
    const result = releaseTaskClaim(db, 'task_3', 'agent-A')
    expect(result.released).toBe(false)
    expect(result.mismatch).toBe(false)
  })

  it('mismatch result maps to CLAIM_MISMATCH envelope warning (node_fa40adcfe1c0)', () => {
    // Verifies that the mismatch signal is collected for envelope inclusion.
    const db = makeDb()
    const lm = new LockManager(db)
    lm.acquire('task_4', 'agent-B')
    const result = releaseTaskClaim(db, 'task_4', 'agent-A')
    // The done-cmd collects this into envelopeWarnings when mismatch=true.
    const warnings: string[] = result.mismatch ? ['CLAIM_MISMATCH'] : []
    expect(warnings).toContain('CLAIM_MISMATCH')
  })

  // node_884a33abee66 — o fluxo REAL adquire com prefixo (task:<nodeId>, via
  // claimNextTask); o release consultava o id puro e era no-op silencioso.
  // Este é o teste de integração entre os dois módulos que faltava.
  describe('integração com o formato real de claim (prefixo task:)', () => {
    it('AC1: lease adquirida via lm.acquire("task:<id>") é liberada por releaseTaskClaim(db, "<id>")', () => {
      const db = makeDb()
      const lm = new LockManager(db)
      lm.acquire('task:node_x', 'agent-A')

      const result = releaseTaskClaim(db, 'node_x', 'agent-A')

      expect(result.released).toBe(true)
      const remaining = db.prepare('SELECT COUNT(*) as c FROM resource_locks').get() as { c: number }
      expect(remaining.c).toBe(0)
    })

    it('AC2: lease prefixada de agent-A não é liberada por agent-B — mismatch nomeando o dono, lease intacta', () => {
      const db = makeDb()
      const lm = new LockManager(db)
      lm.acquire('task:node_x', 'agent-A')

      const result = releaseTaskClaim(db, 'node_x', 'agent-B')

      expect(result.released).toBe(false)
      expect(result.mismatch).toBe(true)
      expect(result.agentId).toBe('agent-A')
      const remaining = db.prepare('SELECT COUNT(*) as c FROM resource_locks').get() as { c: number }
      expect(remaining.c).toBe(1)
    })
  })
})

// node_ca455c0520fc — identidade do env no release: paridade com o next.
// flag > AGF_AGENT_ID; sem nenhum ⇒ undefined (sem release, byte-idêntico).
// Sem fallback de uuid: release com identidade inventada seria sempre mismatch.
describe('resolveReleaseAgentId — flag > env, sem fallback de uuid', () => {
  it('AC2: flag explícita vence o env', async () => {
    const { resolveReleaseAgentId } = await import('../core/planner/resolve-agent-id.js')
    expect(resolveReleaseAgentId('formiga-y', 'formiga-x')).toBe('formiga-y')
  })

  it('AC1: sem flag, cai no env', async () => {
    const { resolveReleaseAgentId } = await import('../core/planner/resolve-agent-id.js')
    expect(resolveReleaseAgentId(undefined, 'formiga-x')).toBe('formiga-x')
  })

  it('AC3: nem flag nem env ⇒ undefined (nenhum release)', async () => {
    const { resolveReleaseAgentId } = await import('../core/planner/resolve-agent-id.js')
    expect(resolveReleaseAgentId(undefined, undefined)).toBeUndefined()
    expect(resolveReleaseAgentId(undefined, '')).toBeUndefined() // env blank = ausente
  })
})

describe('buildDoneDeps.markDone — release de lease com identidade só do env (node_ca455c0520fc)', () => {
  it('AC1: AGF_AGENT_ID setado e sem --agent ⇒ lease liberada no done', async () => {
    const { SqliteStore } = await import('../core/store/sqlite-store.js')
    const { LockManager: LM } = await import('../core/store/lock-manager.js')
    const { buildDoneDeps } = await import('../cli/commands/done-cmd.js')

    const original = process.env.AGF_AGENT_ID
    try {
      const store = SqliteStore.open(':memory:')
      store.initProject('env-release-test')
      const now = new Date().toISOString()
      store.insertNode({
        id: 't1',
        type: 'task',
        title: 'Task t1',
        status: 'in_progress',
        priority: 2,
        createdAt: now,
        updatedAt: now,
      } as never)
      const locks = new LM(store.getDb())
      locks.acquire('task:t1', 'formiga-x', 300)

      process.env.AGF_AGENT_ID = 'formiga-x'
      const deps = buildDoneDeps(store, '/tmp', () => {}) // SEM agentId explícito
      deps.markDone('t1')

      const remaining = locks.listActive().filter((l) => l.resourceId === 'task:t1')
      expect(remaining).toEqual([]) // lease liberada só pela identidade do env
      store.close()
    } finally {
      if (original === undefined) delete process.env.AGF_AGENT_ID
      else process.env.AGF_AGENT_ID = original
    }
  })
})
