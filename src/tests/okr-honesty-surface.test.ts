/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_6dcb10b47b92 — a honestidade do cockpit, provada NA SUPERFÍCIE.
 *
 * As guardas já eram testadas em `computeOkrStatus` (função pura) e em
 * `buildOkrReport` (builder). Isso prova que a REGRA é honesta; não prova que
 * a regra é a que o dev encontra. Entre a regra e a tela existem o coletor, a
 * rota e o comando — e é aí que uma honestidade some sem barulho: alguém liga
 * a superfície a um caminho mais frouxo, todo teste unitário continua verde, e
 * o cockpit passa a pintar de verde o que ninguém mediu.
 *
 * Por isso estes testes atravessam a superfície real (store SQLite de verdade
 * + servidor HTTP de verdade) e, além dos dois exemplos que o AC pede, afirmam
 * um INVARIANTE sobre todas as linhas: nenhuma pode ser `on-track` sem
 * proveniência. Exemplo pega o caso que você imaginou; invariante pega o que
 * o próximo autor vai inventar.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import type { Server } from 'node:http'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { startDashboardServer } from '../api/app-factory.js'
import { collectOkrRows } from '../core/okr/okr-collect.js'
import type { OkrRow } from '../core/okr/okr-report.js'
import type { GraphNode } from '../core/graph/graph-types.js'

const PROJECT_ID = 'proj-okr-honesty'
const NOW = Date.parse('2026-07-19T00:00:00.000Z')

let store: SqliteStore
let server: Server
let base: string

function epic(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
  const ts = '2026-01-01T00:00:00.000Z'
  return {
    id,
    type: 'epic',
    title: `Objetivo ${id}`,
    status: 'in_progress',
    priority: 1,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  }
}

beforeAll(async () => {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  store = new SqliteStore(db)
  store.initProject(PROJECT_ID)

  // Sem fonte de KR nenhuma — o caso do AC1.
  store.insertNode(epic('node_sem_fonte'))

  // KR com current < target e prazo estourado — o caso do AC2.
  store.insertNode(
    epic('node_prazo_estourado', {
      metadata: { kr: { target: 100, current: 40, unit: 'percent', deadline: '2026-06-01T00:00:00.000Z' } },
    }),
  )

  // KR cujo alvo foi realmente atingido — o controle: se NADA pudesse ficar
  // verde, os testes acima passariam por um motivo errado (uma superfície
  // quebrada também nunca diz on-track).
  store.insertNode(
    epic('node_atingido', {
      metadata: { kr: { target: 100, current: 100, unit: 'percent' } },
    }),
  )

  // Uma task entregue: sem ritmo observável tudo cai em no-data e o controle
  // acima não conseguiria ficar verde.
  store.insertNode({
    id: 'node_entrega',
    type: 'task',
    title: 'Uma entrega na janela',
    status: 'done',
    priority: 3,
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-02T00:00:00.000Z',
  })

  const handle = await startDashboardServer(store, { port: 0 })
  server = handle.server
  base = handle.url
})

afterAll(() => {
  server.close()
})

function rowsFromCollector(): OkrRow[] {
  return collectOkrRows(store, { now: NOW }).rows
}

async function rowsFromRoute(): Promise<OkrRow[]> {
  const res = await fetch(`${base}/api/v1/okr`)
  const body = (await res.json()) as { rows: OkrRow[] }
  return body.rows
}

describe('cockpit honesty — through the surface, not only the rule', () => {
  it('an epic with no KR source reads no-data / unset on BOTH surfaces (AC1)', async () => {
    const viaCollector = rowsFromCollector().find((r) => r.epicId === 'node_sem_fonte')
    const viaRoute = (await rowsFromRoute()).find((r) => r.epicId === 'node_sem_fonte')

    for (const [label, row] of [
      ['collector', viaCollector],
      ['route', viaRoute],
    ] as const) {
      expect(row, `${label} dropped the epic entirely`).toBeDefined()
      expect(row?.status, `${label} reported a status the data does not support`).toBe('no-data')
      expect(row?.provenance, `${label} claimed a provenance that does not exist`).toBe('unset')
    }
  })

  it('a KR short of target with a blown deadline reads at-risk, not on-track (AC2)', async () => {
    const viaRoute = (await rowsFromRoute()).find((r) => r.epicId === 'node_prazo_estourado')
    expect(viaRoute?.status).toBe('at-risk')
    expect(viaRoute?.reason).toMatch(/deadline/i)
  })

  it('the control: a genuinely met KR DOES read on-track — the surface can still say yes', async () => {
    // Sem este caso, uma superfície completamente quebrada passaria nos dois
    // testes acima: "nunca diz on-track" é satisfeito por "nunca diz nada".
    const viaRoute = (await rowsFromRoute()).find((r) => r.epicId === 'node_atingido')
    expect(viaRoute?.status).toBe('on-track')
    expect(viaRoute?.provenance).toBe('metadata')
  })

  it('INVARIANT: no row is ever on-track without provenance, whatever the graph holds', async () => {
    // Não é sobre os épicos deste fixture — é sobre qualquer linha que a
    // superfície venha a produzir. Um caminho novo e mais frouxo cai aqui,
    // mesmo que o autor nunca tenha lido este arquivo.
    for (const row of await rowsFromRoute()) {
      if (row.status === 'on-track') {
        expect(row.provenance, `${row.epicId} claims on-track with no source`).not.toBe('unset')
        expect(row.attainment, `${row.epicId} claims on-track with no measurement`).not.toBeNull()
      }
    }
  })

  it('INVARIANT: every row carries a reason — a status is never a bare label', async () => {
    for (const row of await rowsFromRoute()) {
      expect(row.reason.trim().length, `${row.epicId} has a status nobody can audit`).toBeGreaterThan(0)
    }
  })
})
