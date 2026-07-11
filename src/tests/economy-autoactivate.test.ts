/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Prove-it integration for the loss-safe bundle auto-activation (node_85d2ca515e22).
 * The unit tests prove each piece; THIS proves the end-to-end promise: under a detected
 * agent driver, with NO manual `agf economy on`, a bundle lever (ncd_dedup) actually fires
 * during task-prep and lands in the real `economy_lever_ledger` — turning a lever that was
 * $0 into measured savings. The opt-out case is the anti-coincidence anchor: same setup,
 * AGF_ECONOMY_AUTO=0, and the lever must NOT fire (byte-identical to today).
 */

import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { prepareTask } from '../core/autonomy/task-prep.js'
import { TokenLedger } from '../core/autonomy/token-ledger.js'
import { writeMemory } from '../core/memory/memory-reader.js'
import { recordSavingsEvents, summarizeByLever } from '../core/economy/economy-lever-ledger.js'
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

const ENV_KEYS = ['CLAUDECODE', 'AGF_ECONOMY_AUTO'] as const

/** Run `fn` with a Claude Code driver present, optionally opting out of auto-activation. */
async function underDriver(optOut: boolean, fn: () => Promise<void>): Promise<void> {
  const saved = ENV_KEYS.map((k) => [k, process.env[k]] as const)
  process.env.CLAUDECODE = '1'
  if (optOut) process.env.AGF_ECONOMY_AUTO = '0'
  else Reflect.deleteProperty(process.env, 'AGF_ECONOMY_AUTO')
  try {
    await fn()
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) Reflect.deleteProperty(process.env, k)
      else process.env[k] = v
    }
  }
}

/** Seed a project whose two near-duplicate memories trigger ncd_dedup when it is enabled. */
async function seedNearDuplicateProject(dir: string): Promise<SqliteStore> {
  const store = SqliteStore.open(dir)
  store.initProject('autoactivate-test')
  store.insertNode(makeNode({ id: 'node_n', title: 'payment processing flow', type: 'task' }))
  const body = 'payment processing flow handles charges and refunds across many providers in detail right here'
  await writeMemory(dir, 'pay-1', body)
  await writeMemory(dir, 'pay-2', body + ' ') // near-duplicate snippet
  return store
}

describe('loss-safe bundle auto-activation — prove-it (node_85d2ca515e22)', () => {
  let dir: string
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('AC1+AC2: a detected driver auto-fires ncd_dedup (no manual toggle) → ledger row, accepted=1, saved>0', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-autoactivate-on-'))
    const store = await seedNearDuplicateProject(dir)
    const sessionId = 'prove-session-on'

    // Before: the lever has never fired for this session — it is $0.
    expect(summarizeByLever(store.getDb(), sessionId).find((l) => l.lever === 'ncd_dedup')).toBeUndefined()

    await underDriver(false, async () => {
      const ledger = new TokenLedger()
      // NOTE: no setLeverEnabled — auto-activation is the ONLY thing that can enable ncd_dedup here.
      const prep = await prepareTask(
        store,
        { id: 'node_n', title: 'payment processing flow' },
        { projectDir: dir, ledger },
      )
      expect(prep.priorMemories.length).toBe(1) // near-duplicate was dropped
      recordSavingsEvents(store.getDb(), ledger, sessionId) // real flush → economy_lever_ledger
    })

    const row = store
      .getDb()
      .prepare(`SELECT saved, accepted FROM economy_lever_ledger WHERE session_id = ? AND lever = 'ncd_dedup'`)
      .get(sessionId) as { saved: number; accepted: number } | undefined
    store.close()

    expect(row).toBeDefined()
    expect(row?.accepted).toBe(1)
    expect(row?.saved).toBeGreaterThan(0)
  })

  it('anchor: same driver but AGF_ECONOMY_AUTO=0 → ncd_dedup does NOT fire (byte-identical opt-out)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-autoactivate-off-'))
    const store = await seedNearDuplicateProject(dir)
    const sessionId = 'prove-session-off'

    await underDriver(true, async () => {
      const ledger = new TokenLedger()
      const prep = await prepareTask(
        store,
        { id: 'node_n', title: 'payment processing flow' },
        { projectDir: dir, ledger },
      )
      expect(prep.priorMemories.length).toBe(2) // nothing dropped — dedup never ran
      recordSavingsEvents(store.getDb(), ledger, sessionId)
    })

    const row = store
      .getDb()
      .prepare(`SELECT saved FROM economy_lever_ledger WHERE session_id = ? AND lever = 'ncd_dedup'`)
      .get(sessionId)
    store.close()
    expect(row).toBeUndefined()
  })
})
