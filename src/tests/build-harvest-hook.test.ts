/*!
 * TDD: harvest pass for the builder loop NO_TASKS trigger (node_ed1f6c33b7b9).
 *
 * The hook composes the three deterministic harvests that already ship:
 *   - migrate-ac   → folds AC-nodes into parents (cleanup; not drainable work)
 *   - risk-triage  → SURFACE only (lists open risks; promotion stays human-gated)
 *   - wire-dormant → GENERATES drainable WIRE-tasks (this is what `generated` counts)
 *
 * `generated` therefore equals the number of new WIRE-tasks: when > 0 the builder
 * loop re-pulls and drains the new wave (self-feed); when 0 the loop stops honestly.
 *
 * AC1: dormant capabilities → WIRE-tasks persisted, generated === count.
 * AC2: nothing dormant → generated === 0 (loop ends honestly).
 * AC3: re-run with the same module already wired → generated === 0 (idempotent, no infinite loop).
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode } from '../core/graph/graph-types.js'
import type { DormantEntry } from '../core/harness/wire-dormant-ingest.js'
import { buildHarvestHook, runHarvestPass, resolveHarvestHook } from '../cli/shared/build-harvest-hook.js'

function makeStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('Test')
  return store
}

function insertNode(store: SqliteStore, fields: Partial<GraphNode> & { type: string; title: string }): GraphNode {
  const ts = new Date().toISOString()
  const node: GraphNode = {
    id: `node_${Math.random().toString(16).slice(2, 14)}`,
    type: fields.type as never,
    title: fields.title,
    status: (fields.status as never) ?? 'backlog',
    priority: fields.priority ?? 3,
    parentId: fields.parentId,
    acceptanceCriteria: fields.acceptanceCriteria,
    metadata: fields.metadata,
    createdAt: ts,
    updatedAt: ts,
  }
  store.insertNode(node)
  return node
}

const dormant = (module: string): DormantEntry => ({ module, reason: 'no-surface' })

describe('AC1: dormant capabilities become drainable WIRE-tasks', () => {
  it('generates one WIRE-task per dormant module and persists them', () => {
    const store = makeStore()
    const scanDormant = (): DormantEntry[] => [dormant('src/core/foo.ts'), dormant('src/core/bar.ts')]

    const result = runHarvestPass(store, '/proj', { scanDormant })

    expect(result.generated).toBe(2)
    const wired = store.toGraphDocument().nodes.filter((n) => {
      const meta = n.metadata as { source?: string } | undefined
      return meta?.source === 'wire-dormant'
    })
    expect(wired).toHaveLength(2)
  })
})

describe('AC2: nothing dormant ⇒ generated 0 (honest stop)', () => {
  it('returns generated 0 when the scan is empty', () => {
    const store = makeStore()
    const hook = buildHarvestHook(store, '/proj', { scanDormant: () => [] })
    expect(hook().generated).toBe(0)
  })
})

describe('AC3: re-run is idempotent (no infinite loop)', () => {
  it('a module already wired is skipped on the second pass', () => {
    const store = makeStore()
    const scanDormant = (): DormantEntry[] => [dormant('src/core/foo.ts')]

    const first = runHarvestPass(store, '/proj', { scanDormant })
    const second = runHarvestPass(store, '/proj', { scanDormant })

    expect(first.generated).toBe(1)
    expect(second.generated).toBe(0)
  })
})

describe('migrate-ac is composed into the pass (cleanup, not counted as generated)', () => {
  it('folds an AC-node into its parent during harvest without inflating generated', () => {
    const store = makeStore()
    const task = insertNode(store, { type: 'task', title: 'My Task' })
    insertNode(store, { type: 'acceptance_criteria', title: 'Given X When Y Then Z', parentId: task.id })

    const result = runHarvestPass(store, '/proj', { scanDormant: () => [] })

    expect(result.migratedAc).toBe(1)
    expect(result.generated).toBe(0)
    expect(store.getNodeById(task.id)!.acceptanceCriteria ?? []).toContain('Given X When Y Then Z')
  })
})

// node_9a7fece25df8 (A1) — cap top-N anti-avalanche: 692 dormentes não podem virar
// 692 WIRE-tasks numa passada. maxGenerate bounds the wave; order is stable so the
// next pass drains the next slice.
const manyDormant = (n: number): DormantEntry[] =>
  Array.from({ length: n }, (_, i) => dormant(`src/core/mod-${String(i).padStart(3, '0')}.ts`))

describe('AC1: maxGenerate caps WIRE-tasks per pass', () => {
  it('30 dormentes + maxGenerate=10 ⇒ generated === 10', () => {
    const store = makeStore()
    const result = runHarvestPass(store, '/proj', { scanDormant: () => manyDormant(30), maxGenerate: 10 })
    expect(result.generated).toBe(10)
  })
})

describe('AC2: maxGenerate absent ⇒ bounded by default (≤25), never unlimited', () => {
  it('30 dormentes without maxGenerate ⇒ generated === 25 (default cap)', () => {
    const store = makeStore()
    const result = runHarvestPass(store, '/proj', { scanDormant: () => manyDormant(30) })
    expect(result.generated).toBe(25)
  })
})

describe('AC3: stable order ⇒ second pass drains the NEXT distinct slice', () => {
  it('25 dormentes, cap 10: pass1=10, pass2=10 distinct, no overlap', () => {
    const store = makeStore()
    const scanDormant = (): DormantEntry[] => manyDormant(25)
    const wiredModules = (): string[] =>
      store
        .toGraphDocument()
        .nodes.map((n) => n.metadata as { source?: string; dormantModule?: string } | undefined)
        .filter((m) => m?.source === 'wire-dormant')
        .map((m) => m!.dormantModule!)

    const p1 = runHarvestPass(store, '/proj', { scanDormant, maxGenerate: 10 })
    const after1 = new Set(wiredModules())
    const p2 = runHarvestPass(store, '/proj', { scanDormant, maxGenerate: 10 })
    const after2 = wiredModules()

    expect(p1.generated).toBe(10)
    expect(p2.generated).toBe(10)
    expect(after2).toHaveLength(20)
    expect(new Set(after2).size).toBe(20) // zero overlap — all distinct
    // pass2 modules are the next slice, none already wired in pass1
    const p2Only = after2.filter((m) => !after1.has(m))
    expect(p2Only).toHaveLength(10)
  })
})

// node_20f6c8a9fb41 (A4) — gatilho determinístico: a colheita é default-on (o loop
// SEMPRE dispara onHarvest no NO_TASKS), com --no-harvest como opt-out. Fecha a régua
// "quem dispara" sem acoplar o core ao hook-runtime.
describe('AC1: harvest is default-on (fires without a manual flag)', () => {
  it('no opts ⇒ returns a hook', () => {
    const store = makeStore()
    const hook = resolveHarvestHook(store, '/proj', {}, { scanDormant: () => [] })
    expect(typeof hook).toBe('function')
  })
})

describe('AC2: --no-harvest opts out', () => {
  it('noHarvest=true ⇒ returns undefined (loop will not harvest)', () => {
    const store = makeStore()
    const hook = resolveHarvestHook(store, '/proj', { noHarvest: true })
    expect(hook).toBeUndefined()
  })
})
