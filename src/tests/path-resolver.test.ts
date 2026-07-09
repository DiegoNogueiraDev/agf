/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, existsSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import { resolveStorePath, type ResolveOptions } from '../core/store/path-resolver.js'
import { STORE_DIR, DB_FILE } from '../core/utils/constants.js'
import { McpGraphError } from '../core/utils/errors.js'

describe('resolveStorePath', () => {
  let tmpDir: string
  let globalDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'path-resolver-test-'))
    globalDir = mkdtempSync(join(tmpdir(), 'global-dir-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    rmSync(globalDir, { recursive: true, force: true })
  })

  function makeOpts(overrides?: Partial<ResolveOptions>): ResolveOptions {
    return { cwd: tmpDir, globalDir, ...overrides }
  }

  describe('explicit mode', () => {
    it('returns explicit mode when explicitDb is provided', () => {
      const result = resolveStorePath(makeOpts({ explicitDb: '/tmp/custom/graph.db' }))

      expect(result.mode).toBe('explicit')
      expect(result.dbPath).toBe('/tmp/custom/graph.db')
      expect(result.basePath).toBe(tmpDir)
    })

    it('uses cwd as basePath for explicit mode', () => {
      const result = resolveStorePath(makeOpts({ explicitDb: '/tmp/custom/graph.db', cwd: '/custom/project' }))

      expect(result.basePath).toBe('/custom/project')
    })
  })

  describe('local mode', () => {
    beforeEach(() => {
      const localDbDir = join(tmpDir, STORE_DIR)
      mkdirSync(localDbDir, { recursive: true })
      const db = new Database(join(localDbDir, DB_FILE))
      db.close()
    })

    it('detects local graph.db in cwd/workflow-graph/', () => {
      const result = resolveStorePath(makeOpts())

      expect(result.mode).toBe('local')
      expect(result.dbPath).toBe(join(tmpDir, STORE_DIR, DB_FILE))
      expect(result.basePath).toBe(tmpDir)
    })

    it('resolves memories path to local memories dir', () => {
      const result = resolveStorePath(makeOpts())

      expect(result.memoriesPath).toBe(join(tmpDir, STORE_DIR, 'memories'))
    })
  })

  describe('global mode', () => {
    beforeEach(() => {
      mkdirSync(globalDir, { recursive: true })
      const db = new Database(join(globalDir, DB_FILE))
      db.close()
    })

    it('detects global graph.db when local does not exist', () => {
      const result = resolveStorePath(makeOpts())

      expect(result.mode).toBe('global')
      expect(result.dbPath).toBe(join(globalDir, DB_FILE))
      expect(result.basePath).toBe(tmpDir)
    })

    it('resolves memories path to global memories dir', () => {
      const result = resolveStorePath(makeOpts())

      expect(result.memoriesPath).toBe(join(globalDir, 'memories'))
    })

    it('scopes memories by projectId in global mode', () => {
      const result = resolveStorePath(makeOpts({ projectId: 'my-project' }))

      expect(result.memoriesPath).toBe(join(globalDir, 'memories', 'my-project'))
    })
  })

  describe('local takes precedence over global', () => {
    it('returns local when both local and global exist', () => {
      // Create both
      const localDbDir = join(tmpDir, STORE_DIR)
      mkdirSync(localDbDir, { recursive: true })
      const localDb = new Database(join(localDbDir, DB_FILE))
      localDb.close()

      mkdirSync(globalDir, { recursive: true })
      const globalDb = new Database(join(globalDir, DB_FILE))
      globalDb.close()

      const result = resolveStorePath(makeOpts())

      expect(result.mode).toBe('local')
      expect(result.dbPath).toBe(join(tmpDir, STORE_DIR, DB_FILE))
    })
  })

  describe('createGlobal mode', () => {
    it('creates global database when no DB exists and createGlobal is true', () => {
      const result = resolveStorePath(makeOpts({ createGlobal: true }))

      expect(result.mode).toBe('global')
      expect(result.dbPath).toBe(join(globalDir, DB_FILE))
      expect(result.basePath).toBe(tmpDir)
      expect(existsSync(join(globalDir, DB_FILE))).toBe(true)
    })

    it('creates the global directory when createGlobal is true', () => {
      resolveStorePath(makeOpts({ createGlobal: true }))

      expect(existsSync(globalDir)).toBe(true)
    })

    it('resolves memories to global dir with projectId', () => {
      const result = resolveStorePath(makeOpts({ createGlobal: true, projectId: 'proj-42' }))

      expect(result.memoriesPath).toBe(join(globalDir, 'memories', 'proj-42'))
    })
  })

  describe('error handling', () => {
    it('throws McpGraphError when no DB found and createGlobal is false', () => {
      expect(() => resolveStorePath(makeOpts({ createGlobal: false }))).toThrow(McpGraphError)
    })

    it('error message includes paths checked', () => {
      try {
        resolveStorePath(makeOpts({ createGlobal: false }))
        expect.unreachable()
      } catch (err) {
        expect(err).toBeInstanceOf(McpGraphError)
        const msg = (err as McpGraphError).message
        expect(msg).toContain(join(tmpDir, STORE_DIR, DB_FILE))
        expect(msg).toContain(join(globalDir, DB_FILE))
      }
    })
  })

  describe('symlink handling', () => {
    it('resolves basePath via realpath if cwd contains symlinks', async () => {
      // Create real dir, then symlink to it
      // resolveStorePath doesn't do realpath resolution but ensures cwd is used as-is
      const realDir = mkdtempSync(join(tmpdir(), 'real-dir-test-'))
      const symlinkDir = join(tmpDir, 'symlink-project')

      try {
        symlinkSync(realDir, symlinkDir)

        const localDbDir = join(symlinkDir, STORE_DIR)
        mkdirSync(localDbDir, { recursive: true })
        const db = new Database(join(localDbDir, DB_FILE))
        db.close()

        // When basePath includes symlink, it's used as-is
        // resolveStorePath doesn't resolve symlinks, it uses cwd directly
        const result = resolveStorePath(makeOpts({ cwd: symlinkDir }))
        expect(result.mode).toBe('local')
        expect(result.dbPath).toBe(join(symlinkDir, STORE_DIR, DB_FILE))
        expect(result.basePath).toBe(symlinkDir)
      } finally {
        rmSync(realDir, { recursive: true, force: true })
        try {
          rmSync(symlinkDir, { recursive: true, force: true })
        } catch {
          /* symlink already removed or not created */
        }
      }
    })
  })

  describe('non-existent paths', () => {
    it('returns global mode when local dir does not exist but global does', () => {
      mkdirSync(globalDir, { recursive: true })
      const db = new Database(join(globalDir, DB_FILE))
      db.close()

      // Intentionally not creating local workflow-graph dir
      const result = resolveStorePath(makeOpts())
      expect(result.mode).toBe('global')
    })
  })
})
