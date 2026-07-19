/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_629fb6df1e0f — Artifact cache: persiste os edits que ficaram verdes,
 * indexados pela assinatura da task (R1). Ao reencontrar a assinatura, o loop
 * reusa os edits sem chamar o modelo (~0 tokens). Tabela `artifact_cache` (v97).
 */
import type Database from 'better-sqlite3'

export interface ArtifactEdit {
  path: string
  oldString: string
  newString: string
}

export type ArtifactOutcome = 'success' | 'partial' | 'failure'

export interface ArtifactRow {
  id: string
  signature: string
  nodeId?: string
  appliedEdits: ArtifactEdit[]
  approachSummary?: string
  model?: string
  outcome: ArtifactOutcome
  createdAt: number
}

let writeCounter = 0

/** Grava um artefato. INSERT OR IGNORE: 1 por (signature, outcome). */
export function recordArtifact(db: Database.Database, row: ArtifactRow): void {
  db.prepare(
    `INSERT OR IGNORE INTO artifact_cache
       (id, signature, node_id, applied_edits, approach_summary, model, outcome, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.signature,
    row.nodeId ?? null,
    JSON.stringify(row.appliedEdits),
    row.approachSummary ?? null,
    row.model ?? null,
    row.outcome,
    row.createdAt,
  )
  writeCounter++
  if (writeCounter % 10 === 0) {
    pruneOldArtifacts(db)
  }
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

/** Remove entries older than 30 days. Runs on every write (lazy). */
export function pruneOldArtifacts(db: Database.Database): number {
  const cutoff = Date.now() - THIRTY_DAYS_MS
  const result = db.prepare(`DELETE FROM artifact_cache WHERE created_at < ?`).run(cutoff)
  return result.changes
}

interface ArtifactDbRow {
  id: string
  signature: string
  node_id: string | null
  applied_edits: string
  approach_summary: string | null
  model: string | null
  outcome: ArtifactOutcome
  created_at: number
}

function parseEdits(json: string): ArtifactEdit[] {
  try {
    const parsed = JSON.parse(json) as unknown
    return Array.isArray(parsed) ? (parsed as ArtifactEdit[]) : []
  } catch {
    return []
  }
}

/** Consulta artefatos por assinatura — mais recente primeiro. */
export function queryBySignature(db: Database.Database, signature: string): ArtifactRow[] {
  const rows = db
    .prepare(
      `SELECT id, signature, node_id, applied_edits, approach_summary, model, outcome, created_at
       FROM artifact_cache
       WHERE signature = ?
       ORDER BY created_at DESC`,
    )
    .all(signature) as ArtifactDbRow[]

  return rows.map((r) => ({
    id: r.id,
    signature: r.signature,
    nodeId: r.node_id ?? undefined,
    appliedEdits: parseEdits(r.applied_edits),
    approachSummary: r.approach_summary ?? undefined,
    model: r.model ?? undefined,
    outcome: r.outcome,
    createdAt: r.created_at,
  }))
}
