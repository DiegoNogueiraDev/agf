/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * E3T3 (node_3ea9d2dba3f9) — prove-it for the output-economy directive. E3T1/E3T2 put the
 * diff-edit directive in the brief and delivered it to the conductor; this proves the promise
 * leaves a MEASURABLE trace: a fixture with a mirror scaffold makes `buildEnrichedBrief` both
 * (a) emit the directive AND (b) record a scaffold-reuse row in `economy_lever_ledger`
 * (rag_out_recovery / scaffold_recovery). Green-field tasks record nothing (byte-identical).
 */

import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { buildEnrichedBrief } from '../core/context/executor-brief.js'
import type { ScaffoldDescriptor } from '../core/rag-out/gate.js'
import type { GraphNode } from '../core/graph/graph-types.js'

// Unique goal so only the injected corpus matches (deterministic recover decision).
const SCAFFOLD: ScaffoldDescriptor = {
  id: 'sc_e3t3',
  goal: 'zzz unique e3t3 prove-it scaffold marker qqq',
  fitTags: ['zzz', 'e3t3', 'prove', 'marker'],
  slots: ['vision', 'objectives', 'metrics'],
  noveltyFloor: 0,
  structureRef: 'test/e3t3-scaffold.md',
}

function seedNode(dir: string, id: string, title: string): void {
  const store = SqliteStore.open(dir)
  store.initProject('brief-diffedit-e3t3')
  const now = new Date().toISOString()
  store.insertNode({
    id,
    type: 'task',
    title,
    status: 'backlog',
    priority: 3,
    acceptanceCriteria: ['Given an id, returns the brief'],
    tags: [],
    createdAt: now,
    updatedAt: now,
  } as GraphNode)
  store.close()
}

function reuseRows(store: SqliteStore, nodeId: string): Array<{ lever: string; saved: number }> {
  return store
    .getDb()
    .prepare(
      `SELECT lever, saved FROM economy_lever_ledger
       WHERE node_id = ? AND lever IN ('rag_out_recovery', 'scaffold_recovery')`,
    )
    .all(nodeId) as Array<{ lever: string; saved: number }>
}

describe('brief diff-edit prove-it — directive + ledger reuse (node_3ea9d2dba3f9)', () => {
  let dir: string
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('a fixture with a mirror → brief carries the directive AND a reuse row lands in the ledger', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-brief-pi-on-'))
    seedNode(dir, 'node_pi', 'zzz unique e3t3 prove-it scaffold marker qqq')
    const store = SqliteStore.open(dir)
    const brief = await buildEnrichedBrief(store, 'node_pi', { projectDir: dir, scaffoldCorpus: [SCAFFOLD] })

    // (a) the directive is in the brief
    expect(brief?.economyDirective?.scaffoldPath).toBe('test/e3t3-scaffold.md')
    // (b) the reuse is recorded — the promise left a measurable trace
    const rows = reuseRows(store, 'node_pi')
    store.close()
    expect(rows.length).toBeGreaterThanOrEqual(1)
    expect(rows[0]?.lever).toMatch(/recovery/)
  })

  it('a green-field task (empty corpus) → no directive AND no reuse row (byte-identical)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-brief-pi-off-'))
    seedNode(dir, 'node_gf', 'implement an unrelated widget xyz')
    const store = SqliteStore.open(dir)
    const brief = await buildEnrichedBrief(store, 'node_gf', { projectDir: dir, scaffoldCorpus: [] })

    expect(brief?.economyDirective).toBeUndefined()
    const rows = reuseRows(store, 'node_gf')
    store.close()
    expect(rows.length).toBe(0)
  })
})
