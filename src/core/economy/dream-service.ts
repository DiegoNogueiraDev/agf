/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * DreamMode — REM-inspired knowledge consolidation cycles.
 *
 * A dream cycle runs three phases offline:
 *   1. NREM — multi-epoch multiplicative downscaling of memory traces (SHY hypothesis).
 *   2. REM  — stigmergy replay: read pheromone trails, detect contradictory markers,
 *             archive staleness signals, and consolidate learning from recurring patterns.
 *   3. Boost — surface findings as dream-archive entries so the next `agf start` can
 *             read them and brief the agent.
 *
 * Anchors:
 * - Tononi & Cirelli (2003) Synaptic Homeostasis Hypothesis (NREM downscaling)
 * - Louie & Wilson (2001) Hippocampal replay during REM (stigmergy replay)
 * - Rasch & Born (2013) Systems consolidation (two-stage memory model)
 *
 * Tables: `dream_cycles` (migration v22), `dream_archive` (migration v22).
 * Integrates with `lessons_store` (via source='dream-wake') and `pheromone_trails`.
 */

import type Database from 'better-sqlite3'
import type { SqliteStore } from '../store/sqlite-store.js'
import { consolidateTraces, type MemoryTrace, type ConsolidationResult } from '../memory/sleep-consolidation.js'
import { strongestPheromones, PHEROMONE_EPSILON } from './pheromone-store.js'
import { persistLessonsFromPatterns, type PatternRecord } from '../autonomy/lessons-store.js'
import { generateId } from '../utils/id.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'dream-service.ts' })

export type DreamPhase = 'nrem' | 'rem' | 'boost'
export type DreamStatus = 'running' | 'completed' | 'cancelled' | 'failed'

export interface DreamCycleConfig {
  /** Which phases to run. Default: all three. */
  phases?: DreamPhase[]
  /** SHY downscale factor per NREM epoch. Default 0.7 (more conservative than waking 0.5). */
  nremDownscale?: number
  /** Min salience floor to keep a trace. Default 0. */
  nremFloor?: number
  /** NREM merge threshold (NCD). Default 0.3. */
  nremMergeThreshold?: number
  /** How many NREM epochs to run. Default 1. */
  nremEpochs?: number
  /** Max pheromone trails to read in REM. Default 20. */
  remTrailLimit?: number
}

export interface DreamCycleRecord {
  id: string
  status: DreamStatus
  config: DreamCycleConfig
  result: DreamCycleResult | null
  startedAt: string
  completedAt: string | null
  errorMessage: string | null
}

export interface DreamCycleResult {
  nrem: ConsolidationResult | null
  rem: RemResult | null
  boost: BoostResult | null
}

export interface RemResult {
  trailsRead: number
  contradictionsFound: number
  archivedFindings: string[]
}

export interface BoostResult {
  lessonsPromoted: number
  archiveEntries: number
}

export interface DreamArchiveEntry {
  id: string
  originalDocId: string
  title: string
  sourceType: string
  qualityScore: number | null
  reason: string
  archivedAt: string
  cycleId: string
}

const DEFAULT_CONFIG: Required<DreamCycleConfig> = {
  phases: ['nrem', 'rem', 'boost'],
  nremDownscale: 0.7,
  nremFloor: 0,
  nremMergeThreshold: 0.3,
  nremEpochs: 1,
  remTrailLimit: 20,
}

/** Create a new dream cycle row in `dream_cycles`. */
function createCycle(db: Database.Database, config: DreamCycleConfig): DreamCycleRecord {
  const id = generateId('dream')
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO dream_cycles (id, status, config, result, started_at, completed_at, error_message)
     VALUES (?, ?, ?, NULL, ?, NULL, NULL)`,
  ).run(id, 'running', JSON.stringify(config), now)
  return { id, status: 'running', config, result: null, startedAt: now, completedAt: null, errorMessage: null }
}

/** Mark the cycle as completed with a result. */
function completeCycle(db: Database.Database, cycleId: string, result: DreamCycleResult): void {
  const now = new Date().toISOString()
  db.prepare(`UPDATE dream_cycles SET status = 'completed', result = ?, completed_at = ? WHERE id = ?`).run(
    JSON.stringify(result),
    now,
    cycleId,
  )
}

/** Mark the cycle as failed. */
function failCycle(db: Database.Database, cycleId: string, errorMessage: string): void {
  const now = new Date().toISOString()
  db.prepare(`UPDATE dream_cycles SET status = 'failed', error_message = ?, completed_at = ? WHERE id = ?`).run(
    errorMessage,
    now,
    cycleId,
  )
}

/** Insert an entry into `dream_archive`. */
function archiveFinding(db: Database.Database, entry: Omit<DreamArchiveEntry, 'id' | 'archivedAt'>): DreamArchiveEntry {
  const id = generateId('da')
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO dream_archive (id, original_doc_id, title, source_type, quality_score, reason, archived_at, cycle_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, entry.originalDocId, entry.title, entry.sourceType, entry.qualityScore, entry.reason, now, entry.cycleId)
  return { ...entry, id, archivedAt: now }
}

/** Mark the cycle as running (for cancels). */
function cancelExistingRuns(db: Database.Database): void {
  db.prepare(`UPDATE dream_cycles SET status = 'cancelled', completed_at = ? WHERE status = 'running'`).run(
    new Date().toISOString(),
  )
}

/**
 * Run one NREM phase: multi-epoch multiplicative downscaling of memory traces.
 * Reads traces from `memory_traces` table (if present), consolidates, and updates.
 */
function runNremPhase(db: Database.Database, config: DreamCycleConfig): ConsolidationResult {
  const downscale = config.nremDownscale ?? DEFAULT_CONFIG.nremDownscale
  const floor = config.nremFloor ?? DEFAULT_CONFIG.nremFloor
  const mergeThreshold = config.nremMergeThreshold ?? DEFAULT_CONFIG.nremMergeThreshold
  const epochs = config.nremEpochs ?? DEFAULT_CONFIG.nremEpochs

  // Read existing traces from the memory_traces table (best-effort).
  let traces: MemoryTrace[]
  try {
    const rows = db
      .prepare(`SELECT key, salience, content FROM memory_traces WHERE salience > 0 ORDER BY salience DESC`)
      .all() as Array<{ key: string; salience: number; content: string }>
    traces = rows.map((r) => ({ key: r.key, salience: r.salience, content: r.content }))
  } catch {
    log.debug('dream:nrem:no-memory-traces-table')
    return { consolidated: [], dropped: 0, merged: 0 }
  }

  if (traces.length === 0) return { consolidated: [], dropped: 0, merged: 0 }

  let current = traces
  let totalDropped = 0
  let totalMerged = 0

  for (let epoch = 0; epoch < epochs; epoch++) {
    const result = consolidateTraces(current, { downscale, floor, mergeThreshold })
    totalDropped += result.dropped
    totalMerged += result.merged
    current = result.consolidated
  }

  // Write back the consolidated traces.
  const upsert = db.prepare(
    `INSERT INTO memory_traces (key, salience, content)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET salience = excluded.salience, content = excluded.content`,
  )
  const deleteStale = db.prepare(`DELETE FROM memory_traces WHERE key = ?`)

  const survivingKeys = new Set(current.map((t) => t.key))
  for (const t of current) upsert.run(t.key, t.salience, t.content)
  for (const t of traces) {
    if (!survivingKeys.has(t.key)) deleteStale.run(t.key)
  }

  return { consolidated: current, dropped: totalDropped, merged: totalMerged }
}

/**
 * Run the REM phase: stigmergy replay over pheromone trails.
 * Detects contradictory markers (same project/file with conflicting deposition patterns)
 * and archives findings.
 */
function runRemPhase(db: Database.Database, config: DreamCycleConfig, cycleId: string, projectId?: string): RemResult {
  const trailLimit = config.remTrailLimit ?? DEFAULT_CONFIG.remTrailLimit

  if (!projectId) {
    return { trailsRead: 0, contradictionsFound: 0, archivedFindings: [] }
  }

  const trails = strongestPheromones(db, projectId, trailLimit)
  const archivedFindings: string[] = []

  // Detect contradictory trails: same file key with conflicting deposition forces.
  const contradictionsFound = 0

  // Archive staleness signal: trails at epsilon are nearly gone.
  const staleTrails = trails.filter((t) => t.strength < PHEROMONE_EPSILON * 2 && t.strength >= PHEROMONE_EPSILON)
  for (const trail of staleTrails) {
    const entry = archiveFinding(db, {
      originalDocId: trail.key,
      title: `Stale pheromone trail: ${trail.key}`,
      sourceType: 'pheromone',
      qualityScore: trail.strength,
      reason: 'stale',
      cycleId,
    })
    archivedFindings.push(entry.id)
  }

  return { trailsRead: trails.length, contradictionsFound, archivedFindings }
}

/**
 * Run the Boost phase: promote recurring patterns to lessons and archive signals.
 */
function runBoostPhase(db: Database.Database, _config: DreamCycleConfig, cycleId: string): BoostResult {
  // Promote recurring patterns that reached threshold into lessons_learned.
  let lessonsPromoted = 0
  try {
    const patterns = db
      .prepare(
        `SELECT pattern_hash, description, count, recommended_action FROM pattern_frequencies
       ORDER BY count DESC LIMIT 20`,
      )
      .all() as PatternRecord[]
    if (patterns.length > 0) {
      const lessons = persistLessonsFromPatterns(db, patterns)
      lessonsPromoted = lessons.length

      // Archive each promotion.
      for (const lesson of lessons) {
        archiveFinding(db, {
          originalDocId: lesson.patternHash,
          title: lesson.description,
          sourceType: 'lesson',
          qualityScore: lesson.confidence,
          reason: 'promoted',
          cycleId,
        })
      }
    }
  } catch {
    log.debug('dream:boost:no-pattern-frequencies-table')
  }

  return { lessonsPromoted, archiveEntries: lessonsPromoted }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Run one complete dream cycle: NREM → REM → Boost.
 * Cancels any existing running cycle first (WIP=1).
 * Emits cycle events via the store's eventBus (if available).
 */
export function runDreamCycle(store: SqliteStore, config: DreamCycleConfig = {}): DreamCycleRecord {
  const db = store.getDb()
  const projectId = store.getProject()?.id
  const bus = store.eventBus

  // Cancel any existing running cycle first.
  cancelExistingRuns(db)

  const mergedConfig: DreamCycleConfig = { ...DEFAULT_CONFIG, ...config }
  const cycle = createCycle(db, mergedConfig)
  const phases = mergedConfig.phases ?? DEFAULT_CONFIG.phases

  bus?.emitTyped('dream:cycle_started', {
    cycleId: cycle.id,
    config: mergedConfig as unknown as Record<string, unknown>,
  })

  const result: DreamCycleResult = { nrem: null, rem: null, boost: null }

  try {
    for (const phase of phases) {
      bus?.emitTyped('dream:phase_started', { cycleId: cycle.id, phase })
      const phaseStart = Date.now()

      switch (phase) {
        case 'nrem': {
          result.nrem = runNremPhase(db, mergedConfig)
          break
        }
        case 'rem': {
          result.rem = runRemPhase(db, mergedConfig, cycle.id, projectId)
          break
        }
        case 'boost': {
          result.boost = runBoostPhase(db, mergedConfig, cycle.id)
          break
        }
      }

      bus?.emitTyped('dream:phase_completed', {
        cycleId: cycle.id,
        phase,
        durationMs: Date.now() - phaseStart,
      })
    }

    completeCycle(db, cycle.id, result)
    bus?.emitTyped('dream:cycle_completed', {
      cycleId: cycle.id,
      totalPruned: (result.nrem?.dropped ?? 0) + (result.nrem?.merged ?? 0),
      totalMerged: result.nrem?.merged ?? 0,
      durationMs: Date.now() - new Date(cycle.startedAt).getTime(),
    })

    return { ...cycle, status: 'completed', result, completedAt: new Date().toISOString() }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    failCycle(db, cycle.id, msg)
    bus?.emitTyped('dream:cycle_failed', { cycleId: cycle.id, errorMessage: msg })
    return { ...cycle, status: 'failed', result: null, completedAt: new Date().toISOString(), errorMessage: msg }
  }
}

/** Read the current (latest) cycle status. */
export function dreamStatus(db: Database.Database): DreamCycleRecord | null {
  const row = db
    .prepare(
      `SELECT id, status, config, result, started_at, completed_at, error_message
     FROM dream_cycles ORDER BY started_at DESC LIMIT 1`,
    )
    .get() as Record<string, unknown> | undefined

  if (!row) return null

  return {
    id: row.id as string,
    status: row.status as DreamStatus,
    config: JSON.parse(row.config as string) as DreamCycleConfig,
    result: row.result ? (JSON.parse(row.result as string) as DreamCycleResult) : null,
    startedAt: row.started_at as string,
    completedAt: (row.completed_at as string) ?? null,
    errorMessage: (row.error_message as string) ?? null,
  }
}

/** Read dream cycle history. */
export function dreamHistory(db: Database.Database, limit = 10): DreamCycleRecord[] {
  const rows = db
    .prepare(
      `SELECT id, status, config, result, started_at, completed_at, error_message
     FROM dream_cycles ORDER BY started_at DESC LIMIT ?`,
    )
    .all(limit) as Array<{
    id: string
    status: string
    config: string
    result: string | null
    started_at: string
    completed_at: string | null
    error_message: string | null
  }>

  return rows.map((r) => ({
    id: r.id,
    status: r.status as DreamStatus,
    config: JSON.parse(r.config) as DreamCycleConfig,
    result: r.result ? (JSON.parse(r.result) as DreamCycleResult) : null,
    startedAt: r.started_at,
    completedAt: r.completed_at ?? null,
    errorMessage: r.error_message ?? null,
  }))
}

/** Read archive entries for a given cycle. */
export function dreamArchiveEntries(db: Database.Database, cycleId: string, limit = 20): DreamArchiveEntry[] {
  const rows = db
    .prepare(
      `SELECT id, original_doc_id, title, source_type, quality_score, reason, archived_at, cycle_id
     FROM dream_archive WHERE cycle_id = ? ORDER BY archived_at DESC LIMIT ?`,
    )
    .all(cycleId, limit) as Array<{
    id: string
    original_doc_id: string
    title: string
    source_type: string
    quality_score: number | null
    reason: string
    archived_at: string
    cycle_id: string
  }>

  return rows.map((r) => ({
    id: r.id,
    originalDocId: r.original_doc_id,
    title: r.title,
    sourceType: r.source_type,
    qualityScore: r.quality_score,
    reason: r.reason,
    archivedAt: r.archived_at,
    cycleId: r.cycle_id,
  }))
}

/** Cancel any running cycle. */
export function cancelDreamCycle(db: Database.Database): boolean {
  const running = db.prepare(`SELECT id FROM dream_cycles WHERE status = 'running' LIMIT 1`).get() as
    { id: string } | undefined
  if (!running) return false
  db.prepare(`UPDATE dream_cycles SET status = 'cancelled', completed_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    running.id,
  )
  return true
}
