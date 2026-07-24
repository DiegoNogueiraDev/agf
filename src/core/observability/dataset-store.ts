/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * DatasetStore — Persistent datasets for experiment evaluation.
 *
 * Supports creating datasets from manual entries, production traces, or
 * decision logs. Implements Hypothesis Testing (Fisher, 1925):
 * datasets form the controlled population for experiments.
 *
 * Layer: L0_SQL (pure data persistence).
 */

import type Database from 'better-sqlite3'
import { generateId } from '../utils/id.js'
import { now } from '../utils/time.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'dataset-store.ts' })

// ── Interfaces ─────────────────────────────────────────

export interface DatasetRecord {
  id: string
  name: string
  source: string
  entryCount: number
  createdAt: string
}

export interface DatasetEntry {
  id: string
  datasetId: string
  input: Record<string, unknown>
  expectedOutput: Record<string, unknown> | null
  metadata: Record<string, unknown>
  createdAt: string
}

// ── Row types ──────────────────────────────────────────

interface DatasetRow {
  id: string
  name: string
  source: string
  entry_count: number
  created_at: string
}

interface EntryRow {
  id: string
  dataset_id: string
  input: string
  expected_output: string | null
  metadata: string
  created_at: string
}

// ── DatasetStore ───────────────────────────────────────

export class DatasetStore {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /** Create an empty dataset. */
  createDataset(name: string, source: string): string {
    const id = generateId('dataset')
    const createdAt = now()

    this.db
      .prepare('INSERT INTO eval_datasets (id, name, source, entry_count, created_at) VALUES (?, ?, ?, 0, ?)')
      .run(id, name, source, createdAt)

    log.debug('dataset:created', { id, name, source })
    return id
  }

  /** Add an entry to a dataset. */
  addEntry(
    datasetId: string,
    input: Record<string, unknown>,
    expectedOutput?: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): string {
    const id = generateId('entry')
    const createdAt = now()

    this.db
      .prepare(
        'INSERT INTO eval_dataset_entries (id, dataset_id, input, expected_output, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        id,
        datasetId,
        JSON.stringify(input),
        expectedOutput ? JSON.stringify(expectedOutput) : null,
        JSON.stringify(metadata ?? {}),
        createdAt,
      )

    this.db.prepare('UPDATE eval_datasets SET entry_count = entry_count + 1 WHERE id = ?').run(datasetId)

    return id
  }

  /** Create a dataset from execution traces. */
  captureFromTraces(name: string, traceIds: string[]): string {
    const datasetId = this.createDataset(name, 'from_traces')

    for (const traceId of traceIds) {
      const row = this.db.prepare('SELECT * FROM execution_traces WHERE id = ?').get(traceId) as
        | {
            id: string
            node_id: string | null
            tool_name: string
            status: string
            tokens_in: number
            tokens_out: number
          }
        | undefined

      if (row) {
        this.addEntry(datasetId, {
          traceId: row.id,
          nodeId: row.node_id,
          toolName: row.tool_name,
          status: row.status,
          tokensIn: row.tokens_in,
          tokensOut: row.tokens_out,
        })
      }
    }

    return datasetId
  }

  /** Create a dataset from decision log entries. */
  captureFromDecisions(name: string, db: Database.Database): string {
    const datasetId = this.createDataset(name, 'from_decisions')

    const rows = db.prepare('SELECT * FROM decision_log ORDER BY created_at ASC').all() as Array<{
      id: string
      node_id: string
      decision: string
      confidence_score: number
      evidence: string
      weights_used: string
      outcome: string | null
    }>

    for (const row of rows) {
      this.addEntry(
        datasetId,
        {
          decisionId: row.id,
          nodeId: row.node_id,
          decision: row.decision,
          confidenceScore: row.confidence_score,
          evidence: JSON.parse(row.evidence),
          weightsUsed: JSON.parse(row.weights_used),
        },
        row.outcome ? { outcome: row.outcome } : undefined,
      )
    }

    return datasetId
  }

  /** Get a dataset by ID. */
  getDataset(datasetId: string): DatasetRecord | null {
    const row = this.db.prepare('SELECT * FROM eval_datasets WHERE id = ?').get(datasetId) as DatasetRow | undefined

    return row
      ? { id: row.id, name: row.name, source: row.source, entryCount: row.entry_count, createdAt: row.created_at }
      : null
  }

  /** Get all entries for a dataset. */
  getEntries(datasetId: string): DatasetEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM eval_dataset_entries WHERE dataset_id = ? ORDER BY created_at ASC')
      .all(datasetId) as EntryRow[]

    return rows.map((r) => ({
      id: r.id,
      datasetId: r.dataset_id,
      input: JSON.parse(r.input) as Record<string, unknown>,
      expectedOutput: r.expected_output ? (JSON.parse(r.expected_output) as Record<string, unknown>) : null,
      metadata: JSON.parse(r.metadata) as Record<string, unknown>,
      createdAt: r.created_at,
    }))
  }

  /** Get entry count for a dataset. */
  getEntryCount(datasetId: string): number {
    const row = this.db.prepare('SELECT entry_count FROM eval_datasets WHERE id = ?').get(datasetId) as
      { entry_count: number } | undefined

    return row?.entry_count ?? 0
  }
}
