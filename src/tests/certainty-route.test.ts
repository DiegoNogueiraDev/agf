/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes da rota GET /api/v1/certainty/:nodeId (node_3ecf21eea0dc) — thin-wire
 * sobre computeDeliveryCertainty: a MESMA fonte que a CLI e o gate do done usam
 * (o front nunca recomputa pilar). Node inexistente ⇒ 404 explícito, para a aba
 * degradar com mensagem legível em vez de tela branca ou veredito falso.
 * Harness real do dashboard-api: servidor efêmero + store in-memory.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import type { Server } from 'node:http'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { startDashboardServer } from '../api/app-factory.js'

const PROJECT_ID = 'proj-certainty-route'

let store: SqliteStore
let server: Server
let base: string

beforeAll(async () => {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  store = new SqliteStore(db)
  store.initProject(PROJECT_ID)

  store.insertNode({
    id: 'node_certainty_fixture',
    type: 'task',
    title: 'certainty route fixture',
    status: 'in_progress',
    priority: 3,
    testFiles: ['src/tests/certainty-route.test.ts'],
    implementationFiles: ['src/api/routes/certainty.ts'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  const handle = await startDashboardServer(store, { port: 0 })
  server = handle.server
  base = handle.url
})

afterAll(() => {
  server.close()
  store.close()
})

describe('GET /api/v1/certainty/:nodeId', () => {
  it('returns the verdict with band, confidence and the 7 pillars', async () => {
    const node = store.toGraphDocument().nodes[0]
    const res = await fetch(`${base}/api/v1/certainty/${node.id}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { band: string; confidence: number; pillars: unknown[]; nodeId: string }
    expect(body.nodeId).toBe(node.id)
    expect(['PROVEN', 'PROVEN_INCOMPLETE', 'UNKNOWN']).toContain(body.band)
    expect(typeof body.confidence).toBe('number')
    expect(body.pillars).toHaveLength(7)
  })

  it('every pillar carries state + rationale so the web can render the means', async () => {
    const node = store.toGraphDocument().nodes[0]
    const res = await fetch(`${base}/api/v1/certainty/${node.id}`)
    const body = (await res.json()) as { pillars: { state: string; rationale: string; key: string }[] }
    for (const p of body.pillars) {
      expect(['green', 'red', 'na']).toContain(p.state)
      expect(p.rationale.length).toBeGreaterThan(0)
    }
  })

  it('unknown node → 404 (the tab degrades with a message, never a fake verdict)', async () => {
    const res = await fetch(`${base}/api/v1/certainty/node_does_not_exist`)
    expect(res.status).toBe(404)
  })
})
