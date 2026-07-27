/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_7545ee13acd5 — ACO tool routing with pheromone on (intent→tool) edges
 *
 * AC1: tool-pheromone.ts edges keyed by intent:tool, deposit + query work.
 * AC2: ACS selection: q < q0 (0.70) → exploit best; q ≥ q0 → explore random.
 * AC3: JIT injection: top-3 tools by pheromone for a given intent.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../core/store/migrations.js'
import {
  depositToolPheromone,
  selectTool,
  topToolsForIntent,
  type ToolPheromoneEntry,
} from '../core/economy/tool-pheromone.js'

function makeDb() {
  const db = new Database(':memory:')
  runMigrations(db)
  return db
}

// ── AC1 — deposit + query ─────────────────────────────────────────────────────

describe('tool-pheromone (AC1 — deposit + query)', () => {
  it('deposits pheromone and retrieves strength for intent:tool', () => {
    const db = makeDb()
    depositToolPheromone(db, { intent: 'next-task', tool: 'agf-next', amount: 1.0 })
    const top = topToolsForIntent(db, 'next-task', 3)
    expect(top.length).toBeGreaterThan(0)
    expect(top[0].tool).toBe('agf-next')
    expect(top[0].amount).toBeGreaterThan(0)
  })

  it('accumulates deposits for the same edge', () => {
    const db = makeDb()
    depositToolPheromone(db, { intent: 'check', tool: 'agf-check', amount: 0.5 })
    depositToolPheromone(db, { intent: 'check', tool: 'agf-check', amount: 0.5 })
    const top = topToolsForIntent(db, 'check', 3)
    expect(top[0].amount).toBeGreaterThan(0.5)
  })

  it('returns empty array for unknown intent', () => {
    const db = makeDb()
    const top = topToolsForIntent(db, 'unknown-intent-xyz', 3)
    expect(top).toEqual([])
  })
})

// ── AC2 — ACS selection: exploit vs explore ───────────────────────────────────

describe('tool-pheromone (AC2 — ACS selection)', () => {
  it('selectTool always returns a tool from the candidates', () => {
    const db = makeDb()
    depositToolPheromone(db, { intent: 'deploy', tool: 'agf-gate', amount: 2.0 })
    depositToolPheromone(db, { intent: 'deploy', tool: 'agf-export', amount: 0.5 })
    const tools = topToolsForIntent(db, 'deploy', 5)
    const selected = selectTool(tools, { q: 0.0 }) // force exploit (q < q0)
    expect(selected).not.toBeNull()
    expect(['agf-gate', 'agf-export']).toContain(selected)
  })

  it('exploit (q=0.0 < q0=0.70) selects the highest-pheromone tool', () => {
    const db = makeDb()
    depositToolPheromone(db, { intent: 'search', tool: 'best-tool', amount: 5.0 })
    depositToolPheromone(db, { intent: 'search', tool: 'weak-tool', amount: 0.1 })
    const tools = topToolsForIntent(db, 'search', 5)
    const selected = selectTool(tools, { q: 0.0 }) // exploit
    expect(selected).toBe('best-tool')
  })

  it('returns null when no tools available', () => {
    const selected = selectTool([], { q: 0.5 })
    expect(selected).toBeNull()
  })
})

// ── AC3 — JIT top-3 injection ─────────────────────────────────────────────────

describe('tool-pheromone (AC3 — JIT top-3 for intent)', () => {
  it('returns at most N tools sorted by pheromone desc', () => {
    const db = makeDb()
    depositToolPheromone(db, { intent: 'build', tool: 'tool-a', amount: 3.0 })
    depositToolPheromone(db, { intent: 'build', tool: 'tool-b', amount: 1.0 })
    depositToolPheromone(db, { intent: 'build', tool: 'tool-c', amount: 2.0 })
    depositToolPheromone(db, { intent: 'build', tool: 'tool-d', amount: 0.5 })
    const top3 = topToolsForIntent(db, 'build', 3)
    expect(top3.length).toBe(3)
    expect(top3[0].tool).toBe('tool-a')
    expect(top3[1].tool).toBe('tool-c')
    expect(top3[2].tool).toBe('tool-b')
  })
})

// Type shape check
const _check: ToolPheromoneEntry = { tool: 't', amount: 1, ts: 0 }
void _check
