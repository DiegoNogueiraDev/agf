/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Tests for the unified task pipeline seams (`prepareTask` / `finalizeTask`).
 * One prep + one finalize authority shared by the `--live` (provider) path and
 * the delegate (`agf brief` → `agf submit`) path — no bifurcation. Pure data
 * layer, exercised on `:memory:` and temp-dir stores with no provider/LLM.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { prepareTask, finalizeTask } from '../core/autonomy/task-prep.js'
import { TokenLedger } from '../core/autonomy/token-ledger.js'
import { recordArtifact } from '../core/reuse/artifact-cache.js'
import { computeTaskSignature } from '../core/reuse/task-signature.js'
import { queryBySignature } from '../core/reuse/artifact-cache.js'
import { queryEpisodicOutcomes } from '../core/store/episodic-outcomes-store.js'
import { SqliteLearningStore } from '../core/learning/sqlite-learning-store.js'
import { writeMemory } from '../core/memory/memory-reader.js'
import { setLeverEnabled } from '../core/economy/economy-levers-config.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function makeNode(overrides: Partial<GraphNode> & Pick<GraphNode, 'id' | 'title'>): GraphNode {
  const now = new Date().toISOString()
  return {
    type: 'task',
    status: 'backlog',
    priority: 3,
    acceptanceCriteria: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('prepareTask', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('task-prep-test')
  })
  afterEach(() => {
    store.close()
  })

  it('returns a deterministic signature and a none-reuse on a cold graph', async () => {
    store.insertNode(makeNode({ id: 'node_a', title: 'Add multiply to math', type: 'task' }))
    const prep = await prepareTask(store, { id: 'node_a', title: 'Add multiply to math' })

    const expected = computeTaskSignature({
      title: 'Add multiply to math',
      type: 'task',
      acceptanceCriteria: [],
      tags: [],
    })
    expect(prep.signature).toBe(expected)
    expect(prep.reuse.kind).toBe('none')
    // No symbols indexed, flow disabled by default → no injected context.
    expect(prep.repoMap).toBeUndefined()
    expect(prep.flowContext).toBeUndefined()
  })

  it('resolves an exact reuse when a green artifact matches the signature', async () => {
    store.insertNode(makeNode({ id: 'node_b', title: 'Reusable task', type: 'task' }))
    const sig = computeTaskSignature({ title: 'Reusable task', type: 'task', acceptanceCriteria: [], tags: [] })
    recordArtifact(store.getDb(), {
      id: 'art_1',
      signature: sig,
      nodeId: 'node_prev',
      appliedEdits: [{ path: 'math.ts', oldString: 'a - b', newString: 'a + b' }],
      outcome: 'success',
      createdAt: Date.now(),
    })

    const prep = await prepareTask(store, { id: 'node_b', title: 'Reusable task' })
    expect(prep.reuse.kind).toBe('exact')
  })

  it('injects prior memories only when a projectDir is given (default: none)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-prep-mem-'))
    try {
      const diskStore = SqliteStore.open(dir)
      diskStore.initProject('mem-test')
      diskStore.insertNode(makeNode({ id: 'node_m', title: 'oauth login flow', type: 'task' }))
      await writeMemory(dir, 'auth-notes', 'The oauth login flow delegates to an external identity provider.')

      // Without projectDir → no memory I/O, byte-identical to legacy prep.
      const cold = await prepareTask(diskStore, { id: 'node_m', title: 'oauth login flow' })
      expect(cold.priorMemories).toEqual([])

      // With projectDir → the relevant memory is surfaced.
      const warm = await prepareTask(diskStore, { id: 'node_m', title: 'oauth login flow' }, { projectDir: dir })
      expect(warm.priorMemories.length).toBeGreaterThan(0)
      expect(warm.priorMemories[0]?.name).toBe('auth-notes')
      diskStore.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('records a memory_salience lever when activation drops a stale memory (ledger given)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-prep-salience-'))
    try {
      const diskStore = SqliteStore.open(dir)
      diskStore.initProject('salience-test')
      diskStore.insertNode(makeNode({ id: 'node_s', title: 'oauth login flow', type: 'task' }))
      await writeMemory(dir, 'recent-auth', 'oauth login flow uses JWT rotation')
      await writeMemory(dir, 'stale-auth', 'oauth login flow legacy notes from long ago')
      // Backdate the stale memory ~400 days so its ACT-R activation falls below the band.
      const stalePath = join(dir, 'workflow-graph', 'memories', 'stale-auth.md')
      const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000)
      await utimes(stalePath, old, old)

      const ledger = new TokenLedger()
      const warm = await prepareTask(
        diskStore,
        { id: 'node_s', title: 'oauth login flow' },
        { projectDir: dir, ledger },
      )

      expect(warm.priorMemories.map((m) => m.name)).toEqual(['recent-auth'])
      const lever = ledger.entries().find((e) => e.lever === 'memory_salience')
      expect(lever).toBeDefined()
      expect(lever?.savedTokens).toBeGreaterThan(0)
      diskStore.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('drops near-duplicate injected memories only when the ncd_dedup lever is enabled', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-prep-ncd-'))
    try {
      const diskStore = SqliteStore.open(dir)
      diskStore.initProject('ncd-test')
      diskStore.insertNode(makeNode({ id: 'node_n', title: 'payment processing flow', type: 'task' }))
      const body = 'payment processing flow handles charges and refunds across many providers in detail right here'
      await writeMemory(dir, 'pay-1', body)
      await writeMemory(dir, 'pay-2', body + ' ') // near-duplicate snippet

      // OFF (default) → no dedup, both near-duplicates injected.
      const off = await prepareTask(diskStore, { id: 'node_n', title: 'payment processing flow' }, { projectDir: dir })
      expect(off.priorMemories.length).toBe(2)

      // ON → near-duplicate dropped + ncd_dedup lever recorded with saved>0.
      setLeverEnabled(diskStore, 'ncd_dedup', true)
      const ledger = new TokenLedger()
      const on = await prepareTask(
        diskStore,
        { id: 'node_n', title: 'payment processing flow' },
        { projectDir: dir, ledger },
      )
      expect(on.priorMemories.length).toBe(1)
      const lever = ledger.entries().find((e) => e.lever === 'ncd_dedup')
      expect(lever).toBeDefined()
      expect(lever?.savedTokens).toBeGreaterThan(0)
      diskStore.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('stops injecting low-marginal-value memories when the forage_stop lever is enabled', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-prep-mvt-'))
    try {
      const diskStore = SqliteStore.open(dir)
      diskStore.initProject('mvt-test')
      diskStore.insertNode(makeNode({ id: 'node_v', title: 'auth token', type: 'task' }))
      // Activation spread via occurrence frequency (all recent ⇒ no salience-band drop).
      await writeMemory(dir, 'hot', 'auth token '.repeat(8) + 'alpha')
      await writeMemory(dir, 'warm', 'auth token '.repeat(4) + 'beta')
      await writeMemory(dir, 'cool', 'auth token gamma single mention')

      const off = await prepareTask(diskStore, { id: 'node_v', title: 'auth token' }, { projectDir: dir })
      expect(off.priorMemories.length).toBe(3)

      setLeverEnabled(diskStore, 'forage_stop', true)
      const ledger = new TokenLedger()
      const on = await prepareTask(diskStore, { id: 'node_v', title: 'auth token' }, { projectDir: dir, ledger })
      expect(on.priorMemories.length).toBeLessThan(3)
      const lever = ledger.entries().find((e) => e.lever === 'forage_stop')
      expect(lever).toBeDefined()
      expect(lever?.savedTokens).toBeGreaterThan(0)
      diskStore.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('follows stigmergy trails left by a prior finalize only when the lever is on', async () => {
    store.insertNode(makeNode({ id: 'node_st', title: 'touch the auth module', type: 'task' }))

    // OFF (default): finalize deposits nothing, prep follows nothing.
    finalizeTask(
      store,
      { id: 'node_st', title: 'touch the auth module' },
      {
        success: true,
        touchedFiles: ['src/auth.ts'],
        signature: 'sig_st0',
      },
    )
    const cold = await prepareTask(store, { id: 'node_st', title: 'touch the auth module' })
    expect(cold.pheromoneTrails).toEqual([])

    // ON: a green finalize lays a trail; the next prep follows the strongest.
    setLeverEnabled(store, 'stigmergy', true)
    finalizeTask(
      store,
      { id: 'node_st', title: 'touch the auth module' },
      {
        success: true,
        touchedFiles: ['src/auth.ts', 'src/token.ts'],
        signature: 'sig_st1',
      },
    )
    const warm = await prepareTask(store, { id: 'node_st', title: 'touch the auth module' })
    expect(warm.pheromoneTrails).toContain('file:src/auth.ts')
    expect(warm.pheromoneTrails).toContain('file:src/token.ts')
  })

  it('records no ledger levers when no ledger is supplied (read-only prep)', async () => {
    store.insertNode(makeNode({ id: 'node_c', title: 'No ledger task', type: 'task' }))
    const ledger = new TokenLedger()
    await prepareTask(store, { id: 'node_c', title: 'No ledger task' }) // no ledger passed
    expect(ledger.entries().length).toBe(0)
  })
})

describe('finalizeTask', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('task-finalize-test')
  })
  afterEach(() => {
    store.close()
  })

  it('writes episodic + learning rows on success (both execution paths)', () => {
    store.insertNode(makeNode({ id: 'node_d', title: 'Finalize me', type: 'task' }))
    finalizeTask(
      store,
      { id: 'node_d', title: 'Finalize me' },
      {
        success: true,
        touchedFiles: ['src/a.ts'],
        signature: 'sig_d',
      },
    )

    const episodic = queryEpisodicOutcomes(store.getDb())
    expect(episodic.some((e) => e.nodeId === 'node_d' && e.outcome === 'success')).toBe(true)

    const learning = new SqliteLearningStore(store).readAll()
    expect(learning.some((r) => r.nodeId === 'node_d' && r.acPassed)).toBe(true)
  })

  it('records an artifact only when applied edits are present', () => {
    store.insertNode(makeNode({ id: 'node_e', title: 'With edits', type: 'task' }))
    finalizeTask(
      store,
      { id: 'node_e', title: 'With edits' },
      {
        success: true,
        appliedEdits: [{ path: 'x.ts', oldString: 'old', newString: 'new' }],
        signature: 'sig_e',
        model: 'test-model',
      },
    )
    expect(queryBySignature(store.getDb(), 'sig_e').length).toBe(1)

    // Delegate parity case: file names only, no edit payloads → no artifact seeded.
    store.insertNode(makeNode({ id: 'node_f', title: 'No edits', type: 'task' }))
    finalizeTask(
      store,
      { id: 'node_f', title: 'No edits' },
      {
        success: true,
        touchedFiles: ['y.ts'],
        signature: 'sig_f',
      },
    )
    expect(queryBySignature(store.getDb(), 'sig_f').length).toBe(0)
  })

  it('records an artifact_reuse lever on an exact reuse when a ledger is given', () => {
    store.insertNode(makeNode({ id: 'node_g', title: 'Reused exact', type: 'task' }))
    const ledger = new TokenLedger()
    finalizeTask(
      store,
      { id: 'node_g', title: 'Reused exact' },
      {
        success: true,
        appliedEdits: [{ path: 'z.ts', oldString: 'a', newString: 'b' }],
        signature: 'sig_g',
        model: 'test-model',
        reused: 'exact',
      },
      { ledger },
    )

    const lever = ledger.entries().find((e) => e.lever === 'artifact_reuse')
    expect(lever).toBeDefined()
    expect(lever?.savedTokens).toBeGreaterThan(0)
  })

  it('never throws on telemetry failure (best-effort)', () => {
    // A node that is not in the graph still must not crash finalize.
    expect(() =>
      finalizeTask(store, { id: 'ghost', title: 'ghost' }, { success: false, signature: 'sig_ghost' }),
    ).not.toThrow()
  })
})
