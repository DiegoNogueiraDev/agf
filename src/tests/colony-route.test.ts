/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes da rota GET /api/v1/colony (node_d0b980b12d2b) — thin-wire sobre
 * listPheromoneTrails + normalizedEntropy/classifyEntropy (mmas-pheromone) +
 * buildColonyHealthSnapshot. Shape = contract node_c8b85a2b9c29: JSON direto,
 * 200 sempre; colônia vazia ⇒ trails:[] e band 'unknown', nunca 500.
 * Mesmo harness real do dashboard-api: servidor efêmero + store in-memory.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import type { Server } from 'node:http'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { depositPheromone } from '../core/economy/pheromone-store.js'
import { startDashboardServer } from '../api/app-factory.js'

const PROJECT_ID = 'proj-colony-route'

let store: SqliteStore
let server: Server
let base: string

beforeAll(async () => {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  store = new SqliteStore(db)
  store.initProject(PROJECT_ID)

  const handle = await startDashboardServer(store, { port: 0 })
  server = handle.server
  base = handle.url
})

afterAll(() => {
  server.close()
})

describe('GET /api/v1/colony', () => {
  it('empty colony → 200 with trails:[] and band unknown, never 500 (limite do contract)', async () => {
    const res = await fetch(`${base}/api/v1/colony`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { trails: unknown[]; entropy: { hNorm: number; band: string } }
    expect(body.trails).toEqual([])
    expect(body.entropy.hNorm).toBe(0)
    expect(body.entropy.band).toBe('unknown')
  })

  it('with trails → 200 with trails ordered by amount desc + entropy band from classifyEntropy', async () => {
    const projectId = store.getProject()?.id ?? PROJECT_ID
    depositPheromone(store.getDb(), projectId, 'trail-a', 5)
    depositPheromone(store.getDb(), projectId, 'trail-b', 3)
    depositPheromone(store.getDb(), projectId, 'trail-c', 4)

    const res = await fetch(`${base}/api/v1/colony`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      trails: Array<{ key: string; amount: number; ts: number }>
      entropy: { hNorm: number; band: string }
      health?: Record<string, unknown>
    }
    expect(body.trails.map((t) => t.key)).toEqual(['trail-a', 'trail-c', 'trail-b'])
    expect(body.entropy.hNorm).toBeGreaterThan(0)
    expect(['stagnant', 'healthy', 'diffuse']).toContain(body.entropy.band)
    expect(body.health).toBeDefined()
  })
})
