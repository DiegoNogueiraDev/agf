/*!
 * TDD: agf scan --apply-findings creates bug/risk nodes (node_5a47bbb7a9e0).
 *
 * AC1: Given scan findings, When applyFindings runs, Then creates 1 node per
 *      new finding with file:line and AC.
 * AC2: Given same finding already filed, When runs again, Then no duplicate.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { applyFindings, type FindingNode } from '../core/scan/apply-findings.js'
import type { ScanFinding } from '../cli/commands/scan-cmd.js'

function makeStore(): SqliteStore {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  const store = new SqliteStore(db)
  store.initProject()
  return store
}

const FINDINGS: ScanFinding[] = [
  { source: 'harness', file: 'src/foo.ts', line: 12, severity: 'error', message: 'fn too long' },
  { source: 'typecheck', file: 'src/bar.ts', line: 3, severity: 'error', message: 'TS2322: bad type' },
]

describe('AC1: creates 1 node per new finding', () => {
  it('creates a node for each finding', () => {
    const store = makeStore()
    const result = applyFindings(store, FINDINGS)
    expect(result.created).toBe(2)
    expect(result.skipped).toBe(0)
    const nodes: FindingNode[] = result.nodes
    expect(nodes.length).toBe(2)
  })

  it('node has file:line in title and AC', () => {
    const store = makeStore()
    const result = applyFindings(store, FINDINGS)
    const n = result.nodes[0]!
    expect(n.title).toContain('src/foo.ts')
    expect(n.title).toContain('12')
    expect(n.acceptanceCriteria!.length).toBeGreaterThan(0)
  })

  it('node type is task for error severity (no bug type in NodeType)', () => {
    const store = makeStore()
    const result = applyFindings(store, FINDINGS)
    expect(result.nodes[0]!.type).toBe('task')
  })
})

describe('AC2: idempotent — no duplicates on re-run', () => {
  it('second run with same findings skips all (idempotent)', () => {
    const store = makeStore()
    applyFindings(store, FINDINGS)
    const r2 = applyFindings(store, FINDINGS)
    expect(r2.created).toBe(0)
    expect(r2.skipped).toBe(2)
  })

  it('different finding with same file:line skips too', () => {
    const store = makeStore()
    applyFindings(store, [FINDINGS[0]!])
    // Same file:line, different message
    const variant: ScanFinding = { ...FINDINGS[0]!, message: 'different message' }
    const r2 = applyFindings(store, [variant])
    expect(r2.created).toBe(0)
    expect(r2.skipped).toBe(1)
  })
})
