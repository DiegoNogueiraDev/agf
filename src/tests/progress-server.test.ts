/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_17942a1f15a5 — startProgressServer: servidor node:http mínimo da web de
 * progresso. Smoke: sobe em porta efêmera, serve HTML + JSON, fecha.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { startProgressServer, type ProgressServer } from '../core/web/progress-server.js'
import { appendSessionEvent } from '../core/session/session-event-store.js'

let server: ProgressServer | undefined
let store: SqliteStore | undefined

afterEach(async () => {
  if (server) await server.close()
  if (store) store.close()
  server = undefined
  store = undefined
})

describe('startProgressServer — servidor mínimo (#W3)', () => {
  it('GET /api/progress → 200 JSON com o snapshot', async () => {
    store = SqliteStore.open(':memory:')
    store.initProject('kanban')
    server = await startProgressServer(store, { port: 0 })
    const res = await fetch(`${server.url}/api/progress`)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { project: string }
    expect(json.project).toBe('kanban')
  })

  it('GET / → 200 text/html', async () => {
    store = SqliteStore.open(':memory:')
    server = await startProgressServer(store, { port: 0 })
    const res = await fetch(server.url)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type') ?? '').toContain('text/html')
  })

  it('GET /api/logs → 200 JSON com array logs', async () => {
    store = SqliteStore.open(':memory:')
    server = await startProgressServer(store, { port: 0 })
    const res = await fetch(`${server.url}/api/logs`)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { logs: unknown[] }
    expect(Array.isArray(json.logs)).toBe(true)
  })

  it('GET /api/session-events → 200 JSON com eventos persistidos', async () => {
    store = SqliteStore.open(':memory:')
    appendSessionEvent(store.getDb(), {
      channel: 'session:mode-changed',
      timestamp: 't1',
      payload: { to: 'read-only' },
    })
    server = await startProgressServer(store, { port: 0 })
    const res = await fetch(`${server.url}/api/session-events`)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { events: Array<{ channel: string }> }
    expect(json.events).toHaveLength(1)
    expect(json.events[0].channel).toBe('session:mode-changed')
  })

  it('GET /api/session-events?after=N → só eventos mais novos que N', async () => {
    store = SqliteStore.open(':memory:')
    appendSessionEvent(store.getDb(), { channel: 'session:message-update', timestamp: 't1', payload: {} })
    appendSessionEvent(store.getDb(), { channel: 'session:mode-changed', timestamp: 't2', payload: {} })
    server = await startProgressServer(store, { port: 0 })
    const res = await fetch(`${server.url}/api/session-events?after=1`)
    const json = (await res.json()) as { events: Array<{ id: number; channel: string }> }
    expect(json.events.every((e) => e.id > 1)).toBe(true)
  })

  it('GET /api/session-events?after=abc → trata como after=0 e sinaliza warning', async () => {
    store = SqliteStore.open(':memory:')
    appendSessionEvent(store.getDb(), { channel: 'session:mode-changed', timestamp: 't1', payload: {} })
    server = await startProgressServer(store, { port: 0 })
    const res = await fetch(`${server.url}/api/session-events?after=abc`)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { events: unknown[]; warning?: string }
    expect(json.events).toHaveLength(1)
    expect(json.warning).toContain('Expected integer')
  })

  it('GET /api/graph → 200 JSON com nodes/edges do snapshot', async () => {
    store = SqliteStore.open(':memory:')
    store.initProject('proj-graph')
    server = await startProgressServer(store, { port: 0 })
    const res = await fetch(`${server.url}/api/graph`)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { nodes: unknown[]; warning?: string }
    expect(Array.isArray(json.nodes)).toBe(true)
    expect(json.warning).toBeUndefined()
  })

  it('GET /api/graph?limit=abc → usa o default e sinaliza warning', async () => {
    store = SqliteStore.open(':memory:')
    store.initProject('proj-graph')
    server = await startProgressServer(store, { port: 0 })
    const res = await fetch(`${server.url}/api/graph?limit=abc`)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { nodes: unknown[]; warning?: string }
    expect(json.warning).toContain('Expected integer')
  })

  it('rota desconhecida → 404', async () => {
    store = SqliteStore.open(':memory:')
    server = await startProgressServer(store, { port: 0 })
    const res = await fetch(`${server.url}/nope`)
    expect(res.status).toBe(404)
  })

  it('close() para de aceitar conexões', async () => {
    store = SqliteStore.open(':memory:')
    const srv = await startProgressServer(store, { port: 0 })
    const url = srv.url
    await srv.close()
    server = undefined
    await expect(fetch(`${url}/api/progress`)).rejects.toBeTruthy()
  })
})
