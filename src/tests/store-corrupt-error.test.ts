/*!
 * TDD: STORE_CORRUPT classification (node_ce4935eb0c5c / H-03).
 *
 * The bug: openStoreOrFail's catch branch called log.error + process.exit(1)
 * directly when SQLite reported SQLITE_NOTADB/SQLITE_CORRUPT — zero stdout
 * output, indistinguishable from a hang for an agent caller. Mirrors the
 * STORE_NOT_FOUND / STORE_LOCKED fixes: throw a classifiable error and let
 * the entrypoint's fatal envelope stamp STORE_CORRUPT.
 *
 * AC1: GIVEN a corrupt graph.db (SQLITE_NOTADB) WHEN agf <command> runs
 *      THEN stdout contains {ok:false, code: STORE_CORRUPT}.
 * AC2: GIVEN open-store.ts WHEN SQLITE_CORRUPT/SQLITE_NOTADB is thrown by
 *      the driver THEN openStoreOrFail throws StoreCorruptError instead of
 *      calling process.exit(1).
 */

import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isStoreCorruptError, StoreCorruptError, STORE_CORRUPT_CODE } from '../core/store/store-corrupt-error.js'
import { buildFatalEnvelope } from '../cli/fatal.js'
import { openStoreOrFail } from '../cli/open-store.js'

describe('isStoreCorruptError — classifies the corrupt-store error', () => {
  it('returns true for a StoreCorruptError instance', () => {
    expect(isStoreCorruptError(new StoreCorruptError('not a database'))).toBe(true)
  })

  it('returns false for an unrelated error', () => {
    expect(isStoreCorruptError(new Error('boom'))).toBe(false)
  })

  it('returns false for a plain non-error value', () => {
    expect(isStoreCorruptError('nope')).toBe(false)
    expect(isStoreCorruptError(undefined)).toBe(false)
  })
})

describe('buildFatalEnvelope — a corrupt store surfaces as STORE_CORRUPT, not UNCAUGHT', () => {
  it('maps a StoreCorruptError to code STORE_CORRUPT', () => {
    const env = buildFatalEnvelope(new StoreCorruptError('Database corrupt at /tmp/x/workflow-graph/graph.db'))
    expect(env.ok).toBe(false)
    expect(env.code).toBe(STORE_CORRUPT_CODE)
  })

  it('leaves an unrelated error as UNCAUGHT (no false positive)', () => {
    const env = buildFatalEnvelope(new Error('boom'))
    expect(env.code).toBe('UNCAUGHT')
  })
})

describe('AC1/AC2: openStoreOrFail throws instead of exiting when the DB file is corrupt', () => {
  it('throws a StoreCorruptError for a graph.db that is not a valid SQLite file (SQLITE_NOTADB)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-store-corrupt-'))
    try {
      const graphDir = join(dir, 'workflow-graph')
      mkdirSync(graphDir, { recursive: true })
      writeFileSync(join(graphDir, 'graph.db'), 'this is not a sqlite database\n', 'utf-8')

      expect(() => openStoreOrFail(dir)).toThrow(StoreCorruptError)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('the thrown error round-trips through buildFatalEnvelope as STORE_CORRUPT', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-store-corrupt-'))
    try {
      const graphDir = join(dir, 'workflow-graph')
      mkdirSync(graphDir, { recursive: true })
      writeFileSync(join(graphDir, 'graph.db'), 'this is not a sqlite database\n', 'utf-8')

      let caught: unknown
      try {
        openStoreOrFail(dir)
      } catch (err) {
        caught = err
      }
      expect(isStoreCorruptError(caught)).toBe(true)
      expect(buildFatalEnvelope(caught).code).toBe(STORE_CORRUPT_CODE)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
