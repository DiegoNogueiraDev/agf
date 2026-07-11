/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 1.1 AC coverage: savings-tracker.ts DelegateEconomy computation
 *
 * AC1: cmdTok=100, baselineTok=500 → delegateSaved=400, savedPct=80
 * AC2: baselineTok=0 → savedPct=0, no divide-by-zero
 * AC3: delegate mode tokens_saved=0 → delegateSaved from cmdTok vs baselineTok
 * Coverage: savings-tracker.ts ≥ 90% branch coverage
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import {
  getCumulativeSavings,
  recordTaskSavings,
  resetSavings,
  formatSavingsReport,
} from '../core/economy/savings-tracker.js'
import { recordCommandInvocation } from '../core/observability/command-ledger.js'
import type { GraphNode, NodeStatus, NodeType } from '../core/graph/graph-types.js'

let _nSeq = 0
function makeNode(override: Partial<GraphNode> = {}): GraphNode {
  const ts = new Date().toISOString()
  return {
    id: `node_svt_${++_nSeq}`,
    type: 'task' as NodeType,
    title: 'test task',
    description: '',
    status: 'in_progress' as NodeStatus,
    priority: 3,
    xpSize: 'S',
    parentId: null,
    acceptanceCriteria: [],
    tags: [],
    createdAt: ts,
    updatedAt: ts,
    metadata: {},
    ...override,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function freshStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('savings-test')
  return store
}

/**
 * Insert a command invocation so getCumulativeSavings has command ledger data.
 * estimatedTokens = Math.ceil((inputBytes + outputBytes) / 4)
 */
function insertCmd(
  store: SqliteStore,
  opts: {
    inputBytes: number
    outputBytes: number
    graphExportBytes: number
  },
): void {
  recordCommandInvocation(store.getDb(), {
    command: 'agf context',
    inputBytes: opts.inputBytes,
    outputBytes: opts.outputBytes,
    cached: false,
    durationMs: 10,
    graphExportBytes: opts.graphExportBytes,
  })
}

// ── AC1: cmdTok=100, baselineTok=500 → delegateSaved=400, savedPct=80 ─────────

describe('AC1: cmdTok=100 baselineTok=500 → delegateSaved=400 savedPct=80', () => {
  it('delegateSaved=400 when cmdTok=100 and graphExportBytes=2000 (baselineTok=500)', () => {
    const store = freshStore()
    // estimatedTokens = Math.ceil((200+200)/4) = 100 → cmdTok=100
    // graphExportBytes=2000 → baselineTok = Math.ceil(2000/4) = 500
    insertCmd(store, { inputBytes: 200, outputBytes: 200, graphExportBytes: 2000 })

    const report = getCumulativeSavings(store)
    expect(report.delegateEconomy).toBeDefined()
    expect(report.delegateEconomy!.cmdTok).toBe(100)
    expect(report.delegateEconomy!.baselineTok).toBe(500)
    expect(report.delegateEconomy!.delegateSaved).toBe(400)
    store.close()
  })

  it('savedPct=80 when delegateSaved=400 out of baselineTok=500', () => {
    const store = freshStore()
    insertCmd(store, { inputBytes: 200, outputBytes: 200, graphExportBytes: 2000 })

    const report = getCumulativeSavings(store)
    expect(report.delegateEconomy!.savedPct).toBe(80)
    store.close()
  })

  it('cmdCalls=1 when one command is recorded', () => {
    const store = freshStore()
    insertCmd(store, { inputBytes: 200, outputBytes: 200, graphExportBytes: 2000 })

    const report = getCumulativeSavings(store)
    expect(report.delegateEconomy!.cmdCalls).toBe(1)
    store.close()
  })

  it('avgTokPerCmd=100 for a single call with 100 tokens', () => {
    const store = freshStore()
    insertCmd(store, { inputBytes: 200, outputBytes: 200, graphExportBytes: 2000 })

    const report = getCumulativeSavings(store)
    expect(report.delegateEconomy!.avgTokPerCmd).toBe(100)
    store.close()
  })
})

// ── AC2: baselineTok=0 → no divide-by-zero, savedPct=0 ───────────────────────

describe('AC2: baselineTok=0 → no divide-by-zero, delegateEconomy undefined or savedPct=0', () => {
  it('does not throw when no command invocations exist (empty ledger)', () => {
    const store = freshStore()
    expect(() => getCumulativeSavings(store)).not.toThrow()
    store.close()
  })

  it('delegateEconomy is undefined when calls=0 (no commands logged)', () => {
    const store = freshStore()
    const report = getCumulativeSavings(store)
    // delegateEconomy only set when commands.calls > 0 && baselineTok > 0
    expect(report.delegateEconomy).toBeUndefined()
    store.close()
  })

  it('delegateEconomy is undefined when graphExportBytes=0 (no baseline)', () => {
    const store = freshStore()
    // Command with graphExportBytes=0 → baselineTok=0 → no delegateEconomy
    insertCmd(store, { inputBytes: 100, outputBytes: 100, graphExportBytes: 0 })

    const report = getCumulativeSavings(store)
    // The condition: commands.calls > 0 && baselineTok > 0 — fails on baselineTok=0
    expect(report.delegateEconomy).toBeUndefined()
    store.close()
  })

  it('delegateSaved = 0 (not negative) when cmdTok exceeds baselineTok', () => {
    const store = freshStore()
    // cmdTok = 1000, baselineTok = Math.ceil(100/4)=25 → max(0, 25-1000) = 0
    insertCmd(store, { inputBytes: 2000, outputBytes: 2000, graphExportBytes: 100 })

    const report = getCumulativeSavings(store)
    if (report.delegateEconomy) {
      expect(report.delegateEconomy.delegateSaved).toBeGreaterThanOrEqual(0)
    }
    store.close()
  })
})

// ── AC3: tokens_saved=0 → delegateSaved from cmdTok vs baselineTok ───────────

describe('AC3: delegate mode tokens_saved=0 → delegateSaved from cmdTok vs baselineTok', () => {
  it('computes delegateSaved as baselineTok - cmdTok regardless of tokens_saved=0 in llm ledger', () => {
    const store = freshStore()
    // No LLM calls (tokens_saved = 0 in llm_call_ledger)
    // But command ledger has entries → delegateEconomy computed
    insertCmd(store, { inputBytes: 400, outputBytes: 400, graphExportBytes: 8000 })
    // cmdTok = Math.ceil(800/4) = 200, baselineTok = Math.ceil(8000/4) = 2000
    // delegateSaved = max(0, 2000 - 200) = 1800

    const report = getCumulativeSavings(store)
    expect(report.delegateEconomy).toBeDefined()
    expect(report.delegateEconomy!.delegateSaved).toBe(1800)
    store.close()
  })

  it('bounds the baseline to one full read per active day (2 same-day calls do not double-count)', () => {
    const store = freshStore()
    // 2 commands SAME day, each cmdTok=100 and graphExportBytes=2000.
    // OLD (buggy): baselineTok = Σ(graph)/4 = 4000/4 = 1000 — assumes a full graph read
    // on EVERY call. NEW (bounded): one full read (max 2000 B) × 1 active day = 2000 B →
    // baselineTok = 500. The agent does not reload the whole graph on every command.
    insertCmd(store, { inputBytes: 200, outputBytes: 200, graphExportBytes: 2000 })
    insertCmd(store, { inputBytes: 200, outputBytes: 200, graphExportBytes: 2000 })

    const report = getCumulativeSavings(store)
    expect(report.delegateEconomy).toBeDefined()
    expect(report.delegateEconomy!.cmdCalls).toBe(2)
    expect(report.delegateEconomy!.cmdTok).toBe(200)
    expect(report.delegateEconomy!.baselineTok).toBe(500) // bounded, not the raw-Σ 1000
    expect(report.delegateEconomy!.baselineExtrapolated).toBe(true) // the cap engaged
    expect(report.delegateEconomy!.delegateSaved).toBe(300)
    store.close()
  })

  it('clamps savedPct to 0 when agf emitted more than the bounded baseline (never a negative %)', () => {
    const store = freshStore()
    // Tiny graph (100 B) but heavy command output → cmdTok (4000) >> bounded baseline (25).
    // Regression for the dashboard showing "-237% Delegate Savings": savedPct must clamp to 0.
    insertCmd(store, { inputBytes: 4000, outputBytes: 4000, graphExportBytes: 100 })
    insertCmd(store, { inputBytes: 4000, outputBytes: 4000, graphExportBytes: 100 })

    const report = getCumulativeSavings(store)
    expect(report.delegateEconomy).toBeDefined()
    expect(report.delegateEconomy!.savedPct).toBe(0)
    expect(report.delegateEconomy!.delegateSaved).toBe(0)
    store.close()
  })
})

// ── recordTaskSavings coverage ────────────────────────────────────────────────

describe('recordTaskSavings stores and retrieves task economy data', () => {
  it('returns a TaskSavings entry with the node ID', () => {
    const store = freshStore()
    const node = makeNode()
    store.insertNode(node)

    const entry = recordTaskSavings(store, node.id, node.title)
    expect(entry).not.toBeNull()
    expect(entry!.nodeId).toBe(node.id)
    store.close()
  })

  it('persists savings and getCumulativeSavings returns them', () => {
    const store = freshStore()
    const node = makeNode({ title: 'persisted task' })
    store.insertNode(node)

    recordTaskSavings(store, node.id, node.title)
    const report = getCumulativeSavings(store)
    expect(report.tasks.some((t) => t.nodeId === node.id)).toBe(true)
    store.close()
  })

  it('updating an existing node replaces, not appends', () => {
    const store = freshStore()
    const node = makeNode({ title: 'dup task' })
    store.insertNode(node)

    recordTaskSavings(store, node.id, node.title)
    recordTaskSavings(store, node.id, node.title)
    const report = getCumulativeSavings(store)
    expect(report.tasks.filter((t) => t.nodeId === node.id)).toHaveLength(1)
    store.close()
  })
})

// ── resetSavings coverage ─────────────────────────────────────────────────────

describe('resetSavings clears the cumulative ledger', () => {
  it('resets tasks to empty array', () => {
    const store = freshStore()
    const node = makeNode({ title: 'some task' })
    store.insertNode(node)
    recordTaskSavings(store, node.id, node.title)

    resetSavings(store)
    const report = getCumulativeSavings(store)
    expect(report.tasks).toEqual([])
    store.close()
  })

  it('reset does not throw on empty state', () => {
    const store = freshStore()
    expect(() => resetSavings(store)).not.toThrow()
    store.close()
  })
})

// ── formatSavingsReport coverage ──────────────────────────────────────────────

describe('formatSavingsReport returns non-empty string array', () => {
  it('returns an array of strings (empty task list case)', () => {
    const store = freshStore()
    const report = getCumulativeSavings(store)
    const lines = formatSavingsReport(report)
    expect(Array.isArray(lines)).toBe(true)
    expect(lines.length).toBeGreaterThan(0)
    store.close()
  })

  it('includes CLI ECONOMY section when delegateEconomy is set and tasks exist', () => {
    const store = freshStore()
    // Need at least one task so the early-return (tasks.length === 0) is not triggered
    const node = makeNode({ title: 'economy task' })
    store.insertNode(node)
    recordTaskSavings(store, node.id, node.title)

    insertCmd(store, { inputBytes: 200, outputBytes: 200, graphExportBytes: 2000 })
    const report = getCumulativeSavings(store)
    const lines = formatSavingsReport(report)
    const hasCliEconomy = lines.some((l) => l.includes('CLI ECONOMY') || l.includes('Delegate'))
    expect(hasCliEconomy).toBe(true)
    store.close()
  })
})
