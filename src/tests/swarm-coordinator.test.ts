/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_3f17b9170658 — SwarmCoordinator: durable session lifecycle over the
 * swarm_sessions table. The orchestration glue that ties claim+mailbox+consensus
 * into one resumable swarm session (a crashed coordinator can be resumed because
 * state is persisted). Ported from graph-flow/core/swarm/swarm-coordinator.ts.
 */
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { SwarmCoordinator } from '../core/swarm/swarm-coordinator.js'
import { McpGraphError } from '../core/utils/errors.js'

function freshCoord(): SwarmCoordinator {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  return new SwarmCoordinator(db)
}

const cfg = { topology: 'star', consensus: 'majority', maxAgents: 4 } as const

describe('SwarmCoordinator — session lifecycle (#node_3f17b9170658)', () => {
  it('init creates a pending session from a validated config', () => {
    const s = freshCoord().init(cfg)
    expect(s.status).toBe('pending')
    expect(s.topology).toBe('star')
    expect(s.consensus).toBe('majority')
    expect(s.maxAgents).toBe(4)
    expect(s.id).toMatch(/.+/)
  })

  it('start transitions pending → active', () => {
    const c = freshCoord()
    const s = c.init(cfg)
    expect(c.start(s.id).status).toBe('active')
  })

  it('scale clamps within 1..32 and rejects out-of-range', () => {
    const c = freshCoord()
    const s = c.init(cfg)
    expect(c.scale(s.id, 8).maxAgents).toBe(8)
    expect(() => c.scale(s.id, 0)).toThrow(McpGraphError)
    expect(() => c.scale(s.id, 33)).toThrow(McpGraphError)
  })

  it('stop marks the session stopped and clears its agents', () => {
    const c = freshCoord()
    const s = c.init(cfg)
    c.start(s.id)
    expect(c.stop(s.id).status).toBe('stopped')
  })

  it('status / start on an unknown session id throws', () => {
    const c = freshCoord()
    expect(() => c.status('ghost')).toThrow(McpGraphError)
    expect(() => c.start('ghost')).toThrow(McpGraphError)
  })

  it('rejects an invalid topology at init (zod validation)', () => {
    expect(() => freshCoord().init({ topology: 'nope', consensus: 'majority', maxAgents: 2 } as never)).toThrow()
  })
})
