/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import { checkDbIntegrity, createBackup, restoreLastBackup, rotateBackups } from '../core/store/db-recovery.js'

function createHealthyDb(path: string): void {
  const db = new Database(path)
  db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)')
  db.prepare('INSERT INTO test VALUES (?, ?)').run(1, 'hello')
  db.close()
}

function createCorruptDb(path: string): void {
  writeFileSync(path, 'this is not a valid sqlite database file')
}

describe('checkDbIntegrity', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'db-recovery-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns true for a healthy database', () => {
    const dbPath = join(tmpDir, 'healthy.db')
    createHealthyDb(dbPath)
    expect(checkDbIntegrity(dbPath)).toBe(true)
  })

  it('returns false for a corrupted file', () => {
    const dbPath = join(tmpDir, 'corrupt.db')
    createCorruptDb(dbPath)
    expect(checkDbIntegrity(dbPath)).toBe(false)
  })

  it('returns false for a non-existent path', () => {
    expect(checkDbIntegrity(join(tmpDir, 'nonexistent.db'))).toBe(false)
  })

  it('returns true after reopen with WAL mode', () => {
    const dbPath = join(tmpDir, 'wal.db')
    const db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.exec('CREATE TABLE t (x INTEGER)')
    db.close()

    expect(checkDbIntegrity(dbPath)).toBe(true)
  })

  it('returns false for non-SQLite binary data', () => {
    const dbPath = join(tmpDir, 'garbage.db')
    createCorruptDb(dbPath)
    expect(checkDbIntegrity(dbPath)).toBe(false)
  })
})

describe('createBackup', () => {
  let tmpDir: string
  let backupDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'db-recovery-test-'))
    backupDir = join(tmpDir, 'backups')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates a backup file in the specified directory', () => {
    const dbPath = join(tmpDir, 'source.db')
    createHealthyDb(dbPath)

    const backupPath = createBackup(dbPath, backupDir)

    expect(existsSync(backupPath)).toBe(true)
    expect(backupPath).toContain(backupDir)
    expect(backupPath).toContain('source-')
    expect(backupPath).toMatch(/\.db$/)
  })

  it('creates the backup directory if it does not exist', () => {
    const dbPath = join(tmpDir, 'source.db')
    createHealthyDb(dbPath)

    createBackup(dbPath, backupDir)

    expect(existsSync(backupDir)).toBe(true)
  })

  it('backup file contains same data as source', () => {
    const dbPath = join(tmpDir, 'source.db')
    createHealthyDb(dbPath)

    const backupPath = createBackup(dbPath, backupDir)

    const sourceContent = readFileSync(dbPath)
    const backupContent = readFileSync(backupPath)
    expect(backupContent.length).toBeGreaterThan(0)
    expect(backupContent).toEqual(sourceContent)
  })

  it('generates unique filenames with timestamps', () => {
    const dbPath = join(tmpDir, 'source.db')
    createHealthyDb(dbPath)

    const backup1 = createBackup(dbPath, backupDir)
    const backup2 = createBackup(dbPath, backupDir)

    expect(backup1).not.toBe(backup2)
  })

  it('handles database files with different extensions', () => {
    const dbPath = join(tmpDir, 'custom.sqlite')
    createHealthyDb(dbPath)

    const backupPath = createBackup(dbPath, backupDir)

    expect(backupPath).toMatch(/\.sqlite$/)
    expect(basename(backupPath)).toMatch(/^custom-/)
  })
})

describe('restoreLastBackup', () => {
  let tmpDir: string
  let backupDir: string
  let dbPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'db-recovery-test-'))
    backupDir = join(tmpDir, 'backups')
    mkdirSync(backupDir, { recursive: true })
    dbPath = join(tmpDir, 'target.db')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('restores the most recent backup', () => {
    const originalPath = join(tmpDir, 'original.db')
    const db = new Database(originalPath)
    db.exec('CREATE TABLE t (val TEXT)')
    db.prepare("INSERT INTO t VALUES ('original')").run()
    db.close()

    const backupPath = createBackup(originalPath, backupDir)

    // Modify the original
    const db2 = new Database(originalPath)
    db2.prepare("INSERT INTO t VALUES ('modified')").run()
    db2.close()

    // Restore backup to a new path
    const restored = restoreLastBackup(dbPath, backupDir)
    expect(restored).toBe(true)

    // Verify restored content
    const db3 = new Database(dbPath)
    const rows = db3.prepare('SELECT val FROM t').all() as { val: string }[]
    expect(rows).toHaveLength(1)
    expect(rows[0].val).toBe('original')
    db3.close()
  })

  it('returns false when backup directory does not exist', () => {
    const result = restoreLastBackup(dbPath, join(tmpDir, 'nonexistent'))
    expect(result).toBe(false)
  })

  it('returns false when backup directory is empty', () => {
    mkdirSync(join(tmpDir, 'empty-backups'), { recursive: true })
    const result = restoreLastBackup(dbPath, join(tmpDir, 'empty-backups'))
    expect(result).toBe(false)
  })

  it('restores from the most recent when multiple backups exist', () => {
    const sourcePath = join(tmpDir, 'source.db')
    const db = new Database(sourcePath)
    db.exec('CREATE TABLE t (val TEXT)')
    db.close()

    const b1 = createBackup(sourcePath, backupDir)

    const db2 = new Database(sourcePath)
    db2.exec('ALTER TABLE t ADD COLUMN extra TEXT')
    db2.close()
    const b2 = createBackup(sourcePath, backupDir)

    const restored = restoreLastBackup(dbPath, backupDir)
    expect(restored).toBe(true)

    // The restored DB should have the extra column (from most recent backup)
    const db3 = new Database(dbPath)
    const cols = db3.prepare('PRAGMA table_info(t)').all() as { name: string }[]
    expect(cols.find((c) => c.name === 'extra')).toBeTruthy()
    db3.close()
  })
})

describe('rotateBackups', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'db-recovery-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('does nothing when backup count is within limit', () => {
    const backupDir = join(tmpDir, 'backups')
    mkdirSync(backupDir, { recursive: true })
    writeFileSync(join(backupDir, 'a.db'), '')
    writeFileSync(join(backupDir, 'b.db'), '')

    rotateBackups(backupDir, 5)

    expect(readdirSync(backupDir)).toHaveLength(2)
  })

  it('deletes oldest when count exceeds max', () => {
    const backupDir = join(tmpDir, 'backups')
    mkdirSync(backupDir, { recursive: true })
    writeFileSync(join(backupDir, 'oldest.db'), '')
    writeFileSync(join(backupDir, 'middle.db'), '')
    writeFileSync(join(backupDir, 'newest.db'), '')

    rotateBackups(backupDir, 2)

    const remaining = readdirSync(backupDir).sort()
    expect(remaining).toHaveLength(2)
    expect(remaining.sort()).toEqual(['newest.db', 'oldest.db'])
  })

  it('preserves all files when count equals max', () => {
    const backupDir = join(tmpDir, 'backups')
    mkdirSync(backupDir, { recursive: true })
    writeFileSync(join(backupDir, 'a.db'), '')
    writeFileSync(join(backupDir, 'b.db'), '')
    writeFileSync(join(backupDir, 'c.db'), '')

    rotateBackups(backupDir, 3)

    expect(readdirSync(backupDir)).toHaveLength(3)
  })

  it('does nothing when backup dir does not exist', () => {
    const backupDir = join(tmpDir, 'nonexistent')
    expect(() => rotateBackups(backupDir)).not.toThrow()
  })

  it('defaults to maxCount=3', () => {
    const backupDir = join(tmpDir, 'backups')
    mkdirSync(backupDir, { recursive: true })
    for (let i = 0; i < 5; i++) {
      writeFileSync(join(backupDir, `backup-${i}.db`), '')
    }

    rotateBackups(backupDir)

    expect(readdirSync(backupDir)).toHaveLength(3)
  })

  it('keeps newest files after rotation', () => {
    const backupDir = join(tmpDir, 'backups')
    mkdirSync(backupDir, { recursive: true })
    writeFileSync(join(backupDir, '001.db'), '')
    writeFileSync(join(backupDir, '002.db'), '')
    writeFileSync(join(backupDir, '003.db'), '')
    writeFileSync(join(backupDir, '004.db'), '')

    rotateBackups(backupDir, 2)

    const remaining = readdirSync(backupDir).sort()
    expect(remaining).toHaveLength(2)
    expect(remaining[1]).toBe('004.db')
  })
})
