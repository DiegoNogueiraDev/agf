/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_629fb6df1e0f — artifact-cache: persiste edits gerados por assinatura de
 * task para reuso determinístico. Tabela artifact_cache (migração v97).
 */
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { recordArtifact, queryBySignature, type ArtifactRow } from '../core/reuse/artifact-cache.js'

function freshDb(): Database.Database {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  return db
}

const sampleEdits = [{ path: 'src/sum.ts', oldString: 'a - b', newString: 'a + b' }]

function row(over: Partial<ArtifactRow> = {}): ArtifactRow {
  return {
    id: 'art_1',
    signature: 'sig_abc',
    nodeId: 'node_1',
    appliedEdits: sampleEdits,
    approachSummary: 'src/sum.ts:',
    model: 'claude-sonnet-4.6',
    outcome: 'success',
    createdAt: 1,
    ...over,
  }
}

describe('artifact-cache — store por assinatura (#R2)', () => {
  it('grava e consulta por assinatura (com applied_edits e outcome)', () => {
    const db = freshDb()
    recordArtifact(db, row())
    const found = queryBySignature(db, 'sig_abc')
    expect(found.length).toBe(1)
    expect(found[0].outcome).toBe('success')
    expect(found[0].appliedEdits).toEqual(sampleEdits)
    db.close()
  })

  it('mesma assinatura+outcome → sem duplicata (INSERT OR IGNORE)', () => {
    const db = freshDb()
    recordArtifact(db, row({ id: 'art_1' }))
    recordArtifact(db, row({ id: 'art_2' })) // mesmo signature+outcome
    expect(queryBySignature(db, 'sig_abc').length).toBe(1)
    db.close()
  })

  it('várias gravações → mais recente primeiro', () => {
    const db = freshDb()
    recordArtifact(db, row({ id: 'a', signature: 's', outcome: 'failure', createdAt: 10 }))
    recordArtifact(db, row({ id: 'b', signature: 's', outcome: 'success', createdAt: 30 }))
    recordArtifact(db, row({ id: 'c', signature: 's', outcome: 'partial', createdAt: 20 }))
    const found = queryBySignature(db, 's')
    expect(found.map((r) => r.createdAt)).toEqual([30, 20, 10])
    db.close()
  })

  it('assinatura inexistente → vazio', () => {
    const db = freshDb()
    expect(queryBySignature(db, 'nope')).toEqual([])
    db.close()
  })
})
