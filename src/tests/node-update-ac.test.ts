/*!
 * Task node_a6be9581f856 — agf node update --ac flag + run-on AC warning.
 *
 * AC1: node update --ac replaces the node's acceptance criteria
 * AC2: no node recreation needed to pass DoD after ac update
 * AC3: single run-on AC (long, semicolons) → author warned to split
 */

import { describe, it, expect } from 'vitest'
import type { GraphNode } from '../core/graph/graph-types.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { detectRunOnAc, type RunOnAcWarning } from '../core/analyzer/ac-run-on-detector.js'

function openStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('test')
  return store
}

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  const now = new Date().toISOString()
  return {
    id: `node_${Math.random().toString(36).slice(2, 10)}`,
    type: 'task',
    title: 'Test node',
    status: 'backlog',
    priority: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

// ── AC1 — node update --ac replaces acceptance criteria ───────────────────────

describe('node update --ac (AC1)', () => {
  it('replaces acceptance criteria when updateNode is called with acceptanceCriteria', () => {
    const store = openStore()
    const node = makeNode({ title: 'Test', acceptanceCriteria: ['old AC'] })
    store.insertNode(node)
    const updated = store.updateNode(node.id, { acceptanceCriteria: ['new AC 1', 'new AC 2'] })
    expect(updated?.acceptanceCriteria).toEqual(['new AC 1', 'new AC 2'])
  })

  it('preserves other fields when only AC is updated', () => {
    const store = openStore()
    const node = makeNode({ title: 'Keep title', priority: 2 })
    store.insertNode(node)
    const updated = store.updateNode(node.id, { acceptanceCriteria: ['AC A'] })
    expect(updated?.title).toBe('Keep title')
    expect(updated?.acceptanceCriteria).toEqual(['AC A'])
  })
})

// ── AC3 — run-on AC detection ─────────────────────────────────────────────────

describe('detectRunOnAc (AC3)', () => {
  it('detects a single run-on AC with semicolons', () => {
    const acs = ['User can login; user can logout; error message shown on failure']
    const warning: RunOnAcWarning | null = detectRunOnAc(acs)
    expect(warning).not.toBeNull()
    expect(warning?.splitSuggestion.length).toBeGreaterThan(1)
  })

  it('detects a single very long AC (> 120 chars) as run-on', () => {
    const longAc =
      'When the user performs the action then the system should respond correctly and the error state should be handled appropriately'
    const warning = detectRunOnAc([longAc])
    expect(warning).not.toBeNull()
  })

  it('returns null for well-formed multiple short ACs', () => {
    const acs = ['User can login successfully', 'Error shown on bad password', 'Session expires after 30m']
    const warning = detectRunOnAc(acs)
    expect(warning).toBeNull()
  })

  it('includes a message telling the author to split', () => {
    const acs = ['User can do A; user can do B; system logs C']
    const warning = detectRunOnAc(acs)
    expect(warning?.message).toMatch(/split|discrete|multiple/i)
  })

  it('returns null for a single short well-formed AC', () => {
    const warning = detectRunOnAc(['User sees error on invalid input'])
    expect(warning).toBeNull()
  })
})
