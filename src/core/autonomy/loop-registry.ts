/*!
 * Loop registry — persistent CRUD for autonomous loop jobs (loop_jobs table).
 *
 * WHY: Tracks running /loop jobs across sessions so the autonomy layer can
 * resume, stop, and audit them without relying on transient in-memory state.
 *
 * Composes with: SqliteStore (getDb()), agf loop commands.
 * Contract: all functions are pure DB helpers; no I/O beyond the Database handle.
 */

import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'

export type LoopStatus = 'running' | 'stopped'

export interface LoopJob {
  id: string
  prompt: string
  intervalSecs: number
  pid: number
  status: LoopStatus
  runs: number
  createdAt: string
  updatedAt: string
}

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS loop_jobs (
    id TEXT PRIMARY KEY,
    prompt TEXT NOT NULL,
    interval_secs INTEGER NOT NULL,
    pid INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'running',
    runs INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`

function ensureTable(db: Database.Database): void {
  db.exec(CREATE_TABLE)
}

function rowToJob(r: Record<string, unknown>): LoopJob {
  return {
    id: r['id'] as string,
    prompt: r['prompt'] as string,
    intervalSecs: r['interval_secs'] as number,
    pid: (r['pid'] as number) ?? 0,
    status: r['status'] as LoopStatus,
    runs: r['runs'] as number,
    createdAt: r['created_at'] as string,
    updatedAt: r['updated_at'] as string,
  }
}

export function registerLoop(
  db: Database.Database,
  opts: { id?: string; prompt: string; intervalSecs: number; pid?: number },
): string {
  ensureTable(db)
  const id = opts.id ?? randomUUID()
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO loop_jobs (id, prompt, interval_secs, pid, status, runs, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'running', 0, ?, ?)`,
  ).run(id, opts.prompt, opts.intervalSecs, opts.pid ?? 0, now, now)
  return id
}

export function listLoops(db: Database.Database, filters?: { status?: LoopStatus }): LoopJob[] {
  ensureTable(db)
  const where = filters?.status ? `WHERE status = '${filters.status}'` : ''
  const rows = db.prepare(`SELECT * FROM loop_jobs ${where} ORDER BY created_at DESC`).all() as Record<
    string,
    unknown
  >[]
  return rows.map(rowToJob)
}

export function getLoop(db: Database.Database, id: string): LoopJob | undefined {
  ensureTable(db)
  const row = db.prepare('SELECT * FROM loop_jobs WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? rowToJob(row) : undefined
}

export function markStopped(db: Database.Database, id: string): void {
  ensureTable(db)
  db.prepare(`UPDATE loop_jobs SET status = 'stopped', updated_at = ? WHERE id = ?`).run(new Date().toISOString(), id)
}

export function incrementRuns(db: Database.Database, id: string): void {
  ensureTable(db)
  db.prepare(`UPDATE loop_jobs SET runs = runs + 1, updated_at = ? WHERE id = ?`).run(new Date().toISOString(), id)
}
