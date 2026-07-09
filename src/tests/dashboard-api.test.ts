/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Integration tests for the dashboard Express API (src/api). Boots the real
 * server on an ephemeral port over an in-memory store and asserts each route is
 * a faithful thin wire over the store / snapshot builders.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import type { Server } from 'node:http'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode } from '../schemas/entity.schema.js'
import { recordModelCall } from '../core/observability/llm-call-ledger.js'
import { recordLeverEvent } from '../core/economy/economy-lever-ledger.js'
import { startDashboardServer } from '../api/app-factory.js'

function node(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
  const ts = new Date().toISOString()
  return {
    id,
    type: 'task',
    title: `node ${id}`,
    status: 'backlog',
    priority: 3,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  }
}

let store: SqliteStore
let server: Server
let base: string

beforeAll(async () => {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  store = new SqliteStore(db)
  store.initProject('proj-dashboard-api')

  store.insertNode(node('node_a'))
  store.insertNode(node('node_b', { status: 'done' }))

  recordModelCall(db, {
    provider: 'anthropic',
    model: 'claude-opus-4-8',
    inputTokens: 1000,
    outputTokens: 200,
    cachedInputTokens: 300,
    costUsd: 0.5,
  })
  recordLeverEvent(db, {
    sessionId: 's1',
    lever: 'ncd_dedup',
    tokensBefore: 500,
    tokensAfter: 100,
    saved: 400,
    accepted: true,
    gateOutcome: 'accepted',
  })

  const handle = await startDashboardServer(store, { port: 0 })
  server = handle.server
  base = handle.url
})

afterAll(() => {
  server.close()
})

describe('dashboard SPA fallback', () => {
  it('GET / always serves HTML (built SPA or built-in lite page) — never a raw 404', async () => {
    const res = await fetch(`${base}/`)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).not.toContain('Cannot GET')
    expect(html.toLowerCase()).toContain('<!doctype html')
  })
})

describe('dashboard API', () => {
  it('GET /api/v1/health/live → status ok', async () => {
    const res = await fetch(`${base}/api/v1/health/live`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  it('GET /api/v1/health → ok when store is queryable', async () => {
    const res = await fetch(`${base}/api/v1/health`)
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('ok')
  })

  it('GET /api/v1/graph → full nodes + edges from the store', async () => {
    const res = await fetch(`${base}/api/v1/graph`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { nodes: GraphNode[]; edges: unknown[] }
    expect(Array.isArray(body.nodes)).toBe(true)
    expect(Array.isArray(body.edges)).toBe(true)
    expect(body.nodes.map((n) => n.id).sort()).toEqual(['node_a', 'node_b'])
  })

  it('GET /api/v1/graph?limit=1 → truncates nodes via safeParseInt (node_wire_faafd62c0144 — parse-query wire)', async () => {
    const res = await fetch(`${base}/api/v1/graph?limit=1`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { nodes: GraphNode[] }
    expect(body.nodes.length).toBe(1)
  })

  it('GET /api/v1/graph?limit=not-a-number → falls back to unlimited (invalid input, not a crash)', async () => {
    const res = await fetch(`${base}/api/v1/graph?limit=not-a-number`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { nodes: GraphNode[] }
    expect(body.nodes.length).toBe(2)
  })

  it('GET /api/v1/stats → totals + byStatus from the store', async () => {
    const res = await fetch(`${base}/api/v1/stats`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { totalNodes: number; byStatus: Record<string, number> }
    expect(body.totalNodes).toBe(2)
    expect(body.byStatus.done).toBe(1)
  })

  it('GET /api/v1/economy → EconomySnapshot totals + per-lever savings', async () => {
    const res = await fetch(`${base}/api/v1/economy`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      totals: { tokensIn: number; saved: number; costUsd: number; savedUsd: number }
      savingsRate: number
      levers: Array<{ lever: string; totalSaved: number }>
      delegate: unknown
      cache: { tokensSaved: number; hitRate: number; estimatedSavingsUsd: number }
      commands: { calls: number }
    }
    expect(body.totals.tokensIn).toBe(1000)
    expect(body.totals.saved).toBe(400)
    expect(body.totals.savedUsd).toBeGreaterThanOrEqual(0)
    expect(body.levers.find((l) => l.lever === 'ncd_dedup')?.totalSaved).toBe(400)
    // New sections: local cache (300 cached tokens recorded) + command/delegate keys present.
    expect(body.cache.tokensSaved).toBe(300)
    expect(body.cache).toHaveProperty('hitRate')
    expect(body).toHaveProperty('delegate')
    expect(body.commands).toHaveProperty('calls')
  })

  it('POST /api/v1/edges → creates an edge between existing nodes', async () => {
    const res = await fetch(`${base}/api/v1/edges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'node_a', to: 'node_b', relationType: 'depends_on' }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { id: string; from: string; to: string }
    expect(body.from).toBe('node_a')
    expect(body.to).toBe('node_b')
    expect(body.id).toMatch(/^edge/)
    // the new edge is now present in the graph
    const graph = (await (await fetch(`${base}/api/v1/graph`)).json()) as { edges: Array<{ from: string; to: string }> }
    expect(graph.edges.some((e) => e.from === 'node_a' && e.to === 'node_b')).toBe(true)
  })

  it('POST /api/v1/edges → 404 when a node does not exist', async () => {
    const res = await fetch(`${base}/api/v1/edges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'node_a', to: 'ghost', relationType: 'depends_on' }),
    })
    expect(res.status).toBe(404)
  })

  it('GET /api/v1/events → opens a text/event-stream', async () => {
    const ctrl = new AbortController()
    const res = await fetch(`${base}/api/v1/events`, { signal: ctrl.signal })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    ctrl.abort()
  })

  it('GET /api/v1/agent/learnings → aggregateAgentLearnings shape (domainSkills/failures/policies/rules/learnings)', async () => {
    const res = await fetch(`${base}/api/v1/agent/learnings`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      domainSkills: unknown[]
      failures: unknown[]
      policies: unknown[]
      rules: unknown[]
      learnings: string[]
      total: number
    }
    expect(Array.isArray(body.domainSkills)).toBe(true)
    expect(Array.isArray(body.failures)).toBe(true)
    expect(Array.isArray(body.policies)).toBe(true)
    expect(Array.isArray(body.rules)).toBe(true)
    expect(Array.isArray(body.learnings)).toBe(true)
    expect(typeof body.total).toBe('number')
  })
})
