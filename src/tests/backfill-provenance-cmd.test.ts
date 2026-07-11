/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/backfill-provenance-cmd.ts — backfillProvenanceCommand factory wiring.
 */

import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { backfillProvenanceCommand } from '../cli/commands/backfill-provenance-cmd.js'
import { SqliteStore } from '../core/store/sqlite-store.js'

describe('backfillProvenanceCommand', () => {
  it('builds the "backfill-provenance" command with a description', () => {
    const cmd = backfillProvenanceCommand()
    expect(cmd.name()).toBe('backfill-provenance')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
})

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

describe('agf backfill-provenance inherits source_file down parent_of edges (node_wire_e266a9edaaf4)', () => {
  it('backfills a child missing source_file from its sourced parent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-backfill-provenance-'))
    try {
      const store = SqliteStore.open(dir)
      store.initProject('backfill-test')
      const db = store.getDb()

      const now = new Date().toISOString()
      store.insertNode({
        id: 'parent-1',
        type: 'task',
        title: 'Parent task',
        status: 'done',
        priority: 3,
        createdAt: now,
        updatedAt: now,
      })
      store.insertNode({
        id: 'child-1',
        type: 'task',
        title: 'Child task',
        status: 'backlog',
        priority: 3,
        createdAt: now,
        updatedAt: now,
      })
      db.prepare('UPDATE nodes SET source_file = ? WHERE id = ?').run('prd-A.md', 'parent-1')
      store.insertEdge({
        id: 'e1',
        from: 'parent-1',
        to: 'child-1',
        relationType: 'parent_of',
        createdAt: now,
      })
      store.close()

      const out: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        out.push(String(chunk))
        return true
      })
      try {
        await backfillProvenanceCommand().parseAsync(['-d', dir], { from: 'user' })
      } finally {
        spy.mockRestore()
      }

      const envelope = lastEnvelope(out)
      const data = envelope.data as { scanned: number; updated: number }
      expect(envelope.ok).toBe(true)
      expect(data.updated).toBe(1)

      const readBack = SqliteStore.open(dir)
      const row = readBack.getDb().prepare('SELECT source_file FROM nodes WHERE id = ?').get('child-1') as {
        source_file: string
      }
      expect(row.source_file).toBe('prd-A.md')
      readBack.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
