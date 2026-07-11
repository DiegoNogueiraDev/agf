/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_ac6cd10da51b — resolveReuse: decide exact (assinatura idêntica verde),
 * scaffold (vizinho semântico via finder injetável) ou none. O caminho de reuso
 * evita re-raciocínio do modelo.
 */
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { recordArtifact } from '../core/reuse/artifact-cache.js'
import { resolveReuse } from '../core/reuse/resolve-reuse.js'

function freshDb(): Database.Database {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  return db
}

const edits = [{ path: 'a.ts', oldString: 'x', newString: 'y' }]
const neighborEdits = [{ path: 'b.ts', oldString: '', newString: 'scaffold' }]

describe('resolveReuse — exact/scaffold/none (#R3)', () => {
  it('assinatura idêntica com sucesso → exact + edits cacheados', () => {
    const db = freshDb()
    recordArtifact(db, {
      id: 'art_1',
      signature: 'sig',
      appliedEdits: edits,
      outcome: 'success',
      createdAt: 1,
    })
    const d = resolveReuse(db, 'sig')
    expect(d.kind).toBe('exact')
    if (d.kind === 'exact') {
      expect(d.edits).toEqual(edits)
      expect(d.sourceId).toBe('art_1')
    }
    db.close()
  })

  it('cache vazio → none', () => {
    const db = freshDb()
    expect(resolveReuse(db, 'sig').kind).toBe('none')
    db.close()
  })

  it('só há falha na assinatura → none (não reusa fracasso como exact)', () => {
    const db = freshDb()
    recordArtifact(db, { id: 'f', signature: 'sig', appliedEdits: edits, outcome: 'failure', createdAt: 1 })
    expect(resolveReuse(db, 'sig').kind).toBe('none')
    db.close()
  })

  it('sem exato mas vizinho acima do limiar → scaffold com edits do vizinho', () => {
    const db = freshDb()
    const findNeighbor = (): { sourceId: string; similarity: number; edits: typeof neighborEdits } => ({
      sourceId: 'neighbor_1',
      similarity: 0.92,
      edits: neighborEdits,
    })
    const d = resolveReuse(db, 'sig', { findNeighbor }, { scaffoldThreshold: 0.85 })
    expect(d.kind).toBe('scaffold')
    if (d.kind === 'scaffold') {
      expect(d.edits).toEqual(neighborEdits)
      expect(d.sourceId).toBe('neighbor_1')
      expect(d.similarity).toBeCloseTo(0.92)
    }
    db.close()
  })

  it('vizinho abaixo do limiar → none', () => {
    const db = freshDb()
    const findNeighbor = (): { sourceId: string; similarity: number; edits: typeof neighborEdits } => ({
      sourceId: 'n',
      similarity: 0.5,
      edits: neighborEdits,
    })
    expect(resolveReuse(db, 'sig', { findNeighbor }, { scaffoldThreshold: 0.85 }).kind).toBe('none')
    db.close()
  })
})
