/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode, GraphEdge } from '../core/graph/graph-types.js'
import { buildTaskContext } from '../core/context/task-context-builder.js'
import { ECONOMY_LEVERS_SETTING_KEY } from '../core/economy/economy-levers-config.js'

// node_efcdb61eef95 — WIRE: estratégia selecionável (current|submodular|pcst)
// no task-context-builder atrás da lever submodular_select (default-OFF).
// AC1 regressão zero: lever OFF ⇒ saída byte-idêntica. AC2 lever ON +
// submodular + budget ⇒ pack ≤ budget e linha saved>0 no economy_lever_ledger.
// AC3 pcst ⇒ itens do pack formam subgrafo conexo (BFS a partir da task).

const FAT = 'palavra distinta '.repeat(120) // ~2k chars ≈ 500 tokens por vizinho

function buildStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('ctx-select-test')
  const now = new Date().toISOString()
  const addNode = (id: string, description: string): void => {
    store.insertNode({
      id,
      type: 'task',
      title: `Node ${id}`,
      status: 'backlog',
      priority: 2,
      description,
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
  }
  const addEdge = (id: string, from: string, to: string, relationType: string): void => {
    store.insertEdge({ id, from, to, relationType, createdAt: now } as GraphEdge)
  }
  addNode('center', 'task central com AC')
  // 8 vizinhos gordos ligados por related_to — sem poda o pack estoura 2000 tokens.
  for (let i = 1; i <= 8; i += 1) {
    addNode(`r${i}`, `${FAT} vizinho r${i}`)
    addEdge(`e-r${i}`, 'center', `r${i}`, 'related_to')
  }
  return store
}

function enableLever(store: SqliteStore): void {
  store.setProjectSetting(ECONOMY_LEVERS_SETTING_KEY, JSON.stringify({ submodular_select: { enabled: true } }))
}

describe('buildTaskContext — estratégia selecionável atrás da lever submodular_select', () => {
  it('AC1: lever OFF ⇒ saída byte-idêntica ao pipeline atual, mesmo pedindo strategy', () => {
    const store = buildStore()

    const plain = buildTaskContext(store, 'center')
    const withStrategy = buildTaskContext(store, 'center', undefined, {
      selectStrategy: 'submodular',
      budgetTokens: 2000,
    })
    store.close()

    expect(JSON.stringify(withStrategy)).toBe(JSON.stringify(plain))
  })

  it('AC2: lever ON + submodular + budget 2000 ⇒ pack ≤ 2000 tokens e saved>0 no ledger', () => {
    const store = buildStore()
    enableLever(store)

    const unpruned = buildTaskContext(store, 'center')
    expect(unpruned!.metrics.estimatedTokens).toBeGreaterThan(2000) // fixture realmente estoura

    const pruned = buildTaskContext(store, 'center', undefined, {
      selectStrategy: 'submodular',
      budgetTokens: 2000,
    })

    expect(pruned!.metrics.estimatedTokens).toBeLessThanOrEqual(2000)

    const row = store
      .getDb()
      .prepare("SELECT saved FROM economy_lever_ledger WHERE lever = 'submodular_select' ORDER BY ts DESC LIMIT 1")
      .get() as { saved: number } | undefined
    store.close()
    expect(row).toBeDefined()
    expect(row!.saved).toBeGreaterThan(0)
  })

  it('AC3: strategy pcst ⇒ itens selecionados formam subgrafo conexo a partir da task (BFS)', () => {
    const store = buildStore()
    enableLever(store)

    const ctx = buildTaskContext(store, 'center', undefined, {
      selectStrategy: 'pcst',
      budgetTokens: 2000,
    })

    const pickedIds = (ctx!.relatedNodes ?? []).map((n) => n.id)
    expect(ctx!.metrics.estimatedTokens).toBeLessThanOrEqual(2000)
    expect(pickedIds.length).toBeGreaterThan(0)

    // BFS booleano sobre as edges do grafo restrito a {center} ∪ picked.
    const doc = store.toGraphDocument()
    store.close()
    const inPack = new Set(['center', ...pickedIds])
    const adj = new Map<string, string[]>()
    for (const e of doc.edges) {
      if (!inPack.has(e.from) || !inPack.has(e.to)) continue
      adj.set(e.from, [...(adj.get(e.from) ?? []), e.to])
      adj.set(e.to, [...(adj.get(e.to) ?? []), e.from])
    }
    const seen = new Set<string>(['center'])
    const queue = ['center']
    while (queue.length > 0) {
      const cur = queue.shift()!
      for (const nxt of adj.get(cur) ?? []) {
        if (!seen.has(nxt)) {
          seen.add(nxt)
          queue.push(nxt)
        }
      }
    }
    expect(pickedIds.every((id) => seen.has(id))).toBe(true)
  })

  it('strategy current (ou opts ausentes) com lever ON ⇒ não poda nada', () => {
    const store = buildStore()
    enableLever(store)

    const plain = buildTaskContext(store, 'center')
    const current = buildTaskContext(store, 'center', undefined, { selectStrategy: 'current', budgetTokens: 2000 })
    store.close()

    expect(JSON.stringify(current)).toBe(JSON.stringify(plain))
  })
})
