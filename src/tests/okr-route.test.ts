/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes da rota GET /api/v1/okr (node_d2cdf7ea6f1f) — o seam que faltava:
 * o router registrava /graph /colony /economy e NÃO /okr, então a aba do
 * cockpit não tinha o que consumir.
 *
 * O ponto central destes testes não é "a rota responde 200" — é que ela
 * responde **o mesmo que `agf okr`**. Rota e CLI compõem o MESMO coletor
 * (`collectOkrRows`); se um dia alguém duplicar a composição num dos dois
 * lados, o dashboard e o terminal passam a contar histórias diferentes sobre
 * o mesmo épico, cada um verde no seu próprio teste. Por isso o caso central
 * compara os dois caminhos campo a campo, em vez de afirmar um shape.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import type { Server } from 'node:http'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { startDashboardServer } from '../api/app-factory.js'
import { collectOkrRows } from '../core/okr/okr-collect.js'
import type { OkrRow } from '../core/okr/okr-report.js'

const PROJECT_ID = 'proj-okr-route'

let store: SqliteStore
let server: Server
let base: string

interface OkrResponse {
  rows: OkrRow[]
  count: number
  atRisk: number
  noData: number
}

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

describe('GET /api/v1/okr', () => {
  it('no epic with a KR → 200 with data:[], never an error (AC2)', async () => {
    const res = await fetch(`${base}/api/v1/okr`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as OkrResponse
    expect(body.rows).toEqual([])
    expect(body.count).toBe(0)
  })

  it('serves the SAME rows the CLI builds — one composer, two surfaces (AC1)', async () => {
    store.insertNode({
      id: 'node_okr_route_epic',
      type: 'epic',
      title: 'Cockpit de OKR operável',
      status: 'in_progress',
      priority: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: { kr: { target: 100, current: 40, unit: 'percent' } },
    })

    const res = await fetch(`${base}/api/v1/okr`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as OkrResponse

    // The CLI path, composed here exactly as okr-cmd.ts composes it.
    const fromCli = collectOkrRows(store, { now: Date.now() })

    expect(body.rows).toHaveLength(1)
    expect(body.count).toBe(fromCli.rows.length)
    // Field-by-field, not a shape check: a divergence between the two surfaces
    // is precisely the bug this route could introduce.
    const [served] = body.rows
    const [built] = fromCli.rows
    expect(served.epicId).toBe(built.epicId)
    expect(served.objective).toBe(built.objective)
    expect(served.attainment).toBe(built.attainment)
    expect(served.status).toBe(built.status)
    expect(served.provenance).toBe(built.provenance)
    expect(served.attainment).toBe(0.4)
  })

  it('an epic without a KR still reports honestly as no-data, not as zero progress', async () => {
    store.insertNode({
      id: 'node_okr_route_bare',
      type: 'epic',
      title: 'Épico sem KR declarado',
      status: 'backlog',
      priority: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const res = await fetch(`${base}/api/v1/okr`)
    const body = (await res.json()) as OkrResponse
    const bare = body.rows.find((r) => r.epicId === 'node_okr_route_bare')
    expect(bare, 'the bare epic was dropped from the report').toBeDefined()
    // attainment null (unknown) rather than 0 (measured and failing) — the
    // honesty guard the epic's own KR2 demands.
    expect(bare?.attainment).toBeNull()
    expect(bare?.status).toBe('no-data')
    expect(body.noData).toBeGreaterThanOrEqual(1)
  })

  it('?atRisk=true narrows to what needs attention, mirroring the CLI flag', async () => {
    const res = await fetch(`${base}/api/v1/okr?atRisk=true`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as OkrResponse
    const expected = collectOkrRows(store, { now: Date.now(), atRiskOnly: true })
    expect(body.count).toBe(expected.rows.length)
    expect(body.rows.every((r) => r.status === 'at-risk')).toBe(true)
  })
})
