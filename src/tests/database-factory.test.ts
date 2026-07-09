/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Validates the runtime DB factory under Node (better-sqlite3 path). The Bun
 * (bun:sqlite adapter) path is validated by a Bun smoke run in the packaging
 * flow, since vitest executes under Node where `bun:sqlite` is unavailable.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDatabase, isBunRuntime } from '../core/store/database-factory.js'
import { getLogBuffer, clearLogBuffer } from '../core/utils/logger.js'

describe('createDatabase (Node / better-sqlite3 path)', () => {
  it('reports Node runtime under vitest', () => {
    expect(isBunRuntime).toBe(false)
  })

  it('opens an in-memory db and supports the better-sqlite3 surface agf uses', () => {
    const db = createDatabase(':memory:')
    // pragma (set)
    db.pragma('journal_mode = WAL')
    // exec + prepare/run/get/all
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)')
    const ins = db.prepare('INSERT INTO t (v) VALUES (?)')
    const r = ins.run('a')
    expect(r.changes).toBe(1)
    expect(db.prepare('SELECT v FROM t WHERE id = ?').get(r.lastInsertRowid)).toEqual({ v: 'a' })
    // transaction
    const tx = db.transaction(() => {
      ins.run('b')
      ins.run('c')
    })
    tx()
    expect(db.prepare('SELECT COUNT(*) AS c FROM t').get()).toEqual({ c: 3 })
    db.close()
  })

  it('supports named-parameter binding (bare keys)', () => {
    const db = createDatabase(':memory:')
    db.exec('CREATE TABLE u (name TEXT, age INTEGER)')
    db.prepare('INSERT INTO u (name, age) VALUES (@name, @age)').run({ name: 'x', age: 7 })
    expect(db.prepare('SELECT age FROM u WHERE name = @name').get({ name: 'x' })).toEqual({ age: 7 })
    db.close()
  })

  it('accepts a readonly handle on an existing file and blocks writes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-dbfactory-'))
    const file = join(dir, 'ro.db')
    const rw = createDatabase(file)
    rw.exec('CREATE TABLE z (x INTEGER)')
    rw.prepare('INSERT INTO z (x) VALUES (1)').run()
    rw.close()

    const ro = createDatabase(file, { readonly: true })
    expect(ro.prepare('SELECT x FROM z').get()).toEqual({ x: 1 })
    expect(() => ro.exec('INSERT INTO z (x) VALUES (2)')).toThrow()
    ro.close()
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('createDatabase — slow-query detection (node_wire_3c771baade03 — slow-query-detector wire)', () => {
  afterEach(() => {
    delete process.env.SQLITE_SLOW_QUERY_MS
    clearLogBuffer()
  })

  it('warns via the real logger when a query exceeds threshold (Date.now advanced past it)', () => {
    process.env.SQLITE_SLOW_QUERY_MS = '10'
    clearLogBuffer()
    const db = createDatabase(':memory:')
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)')

    let call = 0
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
      call++
      // First call is the "start" timestamp read inside the wrapper; every
      // call after simulates 1000ms elapsed so the query always reads slow.
      return call === 1 ? 0 : 1000
    })
    db.prepare('INSERT INTO t (v) VALUES (?)').run('a')
    nowSpy.mockRestore()
    db.close()

    const warnings = getLogBuffer().filter((e) => e.level === 'warn' && e.message === 'slow-query')
    expect(warnings.length).toBe(1)
  })

  it('does not warn for a fast query under the default threshold', () => {
    delete process.env.SQLITE_SLOW_QUERY_MS
    clearLogBuffer()
    const db = createDatabase(':memory:')
    db.exec('CREATE TABLE t2 (id INTEGER PRIMARY KEY)')
    db.prepare('INSERT INTO t2 DEFAULT VALUES').run()
    db.close()

    const warnings = getLogBuffer().filter((e) => e.level === 'warn' && e.message === 'slow-query')
    expect(warnings.length).toBe(0)
  })
})
