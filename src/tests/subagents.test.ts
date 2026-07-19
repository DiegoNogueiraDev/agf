/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { SubagentSchema, SubagentsSchema, type Subagent } from '../schemas/session.schema.js'
import { listSubagents, readSwarmSubagents } from '../core/session/subagents.js'

function seededSwarmDb(): Database.Database {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  db.prepare(
    `INSERT INTO swarm_sessions (id,topology,consensus,status,max_agents,strategy,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).run('sw1', 'mesh', 'majority', 'active', 4, 'parallel', 't0', 't0')
  db.prepare(`INSERT INTO swarm_agents (id,session_id,role,status,created_at) VALUES (?,?,?,?,?)`).run(
    'a1',
    'sw1',
    'coordinator',
    'claimed',
    't1',
  )
  db.prepare(`INSERT INTO swarm_agents (id,session_id,role,status,created_at) VALUES (?,?,?,?,?)`).run(
    'a2',
    'sw1',
    'worker',
    'pending',
    't2',
  )
  return db
}

describe('SubagentSchema', () => {
  const valid: Subagent = { id: 'agent_1', role: 'reviewer', status: 'active', model: 'haiku' }

  it('validates a subagent', () => {
    expect(SubagentSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts a null model', () => {
    expect(SubagentSchema.safeParse({ ...valid, model: null }).success).toBe(true)
  })

  it('rejects an unknown status', () => {
    expect(SubagentSchema.safeParse({ ...valid, status: 'sleeping' }).success).toBe(false)
  })
})

describe('listSubagents', () => {
  it('returns an empty list when there are no records', () => {
    expect(listSubagents([])).toEqual([])
  })

  it('projects raw worker/agent records into validated subagents', () => {
    const out = listSubagents([
      { id: 'w1', role: 'implementor', status: 'active', model: 'sonnet' },
      { id: 'w2', role: 'validator', status: 'idle', model: null },
    ])
    expect(SubagentsSchema.safeParse(out).success).toBe(true)
    expect(out.map((s) => s.id)).toEqual(['w1', 'w2'])
  })
})

describe('readSwarmSubagents', () => {
  it('projects swarm_agents rows into validated subagents with mapped status', () => {
    const db = seededSwarmDb()
    try {
      const subs = readSwarmSubagents(db)
      expect(SubagentsSchema.safeParse(subs).success).toBe(true)
      const a1 = subs.find((s) => s.id === 'a1')!
      expect(a1.role).toBe('coordinator') // arbitrary real role allowed
      expect(a1.status).toBe('active') // claimed -> active
      expect(a1.model).toBeNull()
      const a2 = subs.find((s) => s.id === 'a2')!
      expect(a2.status).toBe('idle') // pending -> idle
    } finally {
      db.close()
    }
  })

  it('returns empty when there are no swarm agents', () => {
    const db = new Database(':memory:')
    configureDb(db)
    runMigrations(db)
    try {
      expect(readSwarmSubagents(db)).toEqual([])
    } finally {
      db.close()
    }
  })
})
