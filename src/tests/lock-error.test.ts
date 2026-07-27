/*!
 * TDD: STORE_LOCKED classification (node_82afbc5c27f4).
 *
 * The user's original symptom: under a DB lock, `agf` could surface an empty
 * envelope indistinguishable from "no data". These tests pin the fix — a lock
 * MUST be classified and surfaced as `code:'STORE_LOCKED'`, never swallowed.
 *
 * AC1: GIVEN the DB under BEGIN IMMEDIATE WHEN a read/write command runs THEN
 *      it fails loud with code STORE_LOCKED (not an empty data envelope).
 */

import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { isDatabaseLockedError, STORE_LOCKED_CODE } from '../core/store/lock-error.js'
import { buildFatalEnvelope } from '../cli/fatal.js'

const req = createRequire(import.meta.url)
type DbCtor = new (
  file: string,
  opts?: { timeout?: number },
) => {
  pragma(s: string): unknown
  exec(s: string): void
  prepare(s: string): { run(...a: unknown[]): unknown }
  close(): void
}
const Database = req('better-sqlite3') as DbCtor

describe('isDatabaseLockedError — classifies SQLite lock errors', () => {
  it('returns true for a SQLITE_BUSY error code', () => {
    expect(isDatabaseLockedError({ code: 'SQLITE_BUSY' })).toBe(true)
  })

  it('returns true for a SQLITE_BUSY_SNAPSHOT error code', () => {
    expect(isDatabaseLockedError({ code: 'SQLITE_BUSY_SNAPSHOT' })).toBe(true)
  })

  it('returns true for an Error whose message says the database is locked', () => {
    expect(isDatabaseLockedError(new Error('database is locked'))).toBe(true)
  })

  it('returns false for an unrelated error (corrupt DB)', () => {
    expect(isDatabaseLockedError({ code: 'SQLITE_CORRUPT' })).toBe(false)
  })

  it('returns false for a plain non-error value', () => {
    expect(isDatabaseLockedError('nope')).toBe(false)
    expect(isDatabaseLockedError(undefined)).toBe(false)
  })
})

describe('buildFatalEnvelope — a lock surfaces as STORE_LOCKED, not UNCAUGHT', () => {
  it('maps a SQLITE_BUSY error to code STORE_LOCKED', () => {
    const env = buildFatalEnvelope({ code: 'SQLITE_BUSY', message: 'database is locked' })
    expect(env.ok).toBe(false)
    expect(env.code).toBe(STORE_LOCKED_CODE)
  })

  it('leaves an unrelated error as UNCAUGHT (no false positive)', () => {
    const env = buildFatalEnvelope(new Error('boom'))
    expect(env.code).toBe('UNCAUGHT')
  })
})

describe('AC1: a real DB under BEGIN IMMEDIATE fails loud with STORE_LOCKED', () => {
  it('a second connection blocked by a held write lock produces a STORE_LOCKED envelope', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-lock-'))
    const file = join(dir, 'graph.db')
    const holder = new Database(file)
    const contender = new Database(file, { timeout: 0 })
    try {
      holder.exec('CREATE TABLE t (id INTEGER)')
      // Hold a reserved write lock — the classic contention the symptom came from.
      holder.exec('BEGIN IMMEDIATE')
      let caught: unknown
      try {
        contender.exec('BEGIN IMMEDIATE')
        contender.prepare('INSERT INTO t (id) VALUES (1)').run()
      } catch (err) {
        caught = err
      }
      expect(caught).toBeDefined()
      expect(isDatabaseLockedError(caught)).toBe(true)
      // The whole point: the CLI envelope is honest, not empty.
      expect(buildFatalEnvelope(caught).code).toBe(STORE_LOCKED_CODE)
    } finally {
      try {
        holder.exec('ROLLBACK')
      } catch {
        /* ignore */
      }
      holder.close()
      contender.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
