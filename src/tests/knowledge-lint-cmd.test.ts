/*!
 * Task node_0db2e3d7a9b3 — agf knowledge-lint CLI command.
 *
 * AC1: agf knowledge-lint --json → ok:true envelope with data.findings array.
 * AC2: --select data.findings → just the array.
 * AC3: data.deleted===0 always (never deletes).
 */

import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import path, { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { SqliteStore } from '../core/store/sqlite-store.js'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** Seed a fresh migrated graph.db in the temp dir (no dependency on a pre-existing project DB). */
function initGraph(dir: string): void {
  const storeDir = join(dir, 'workflow-graph')
  mkdirSync(storeDir, { recursive: true })
  const db = new Database(join(storeDir, 'graph.db'))
  configureDb(db)
  runMigrations(db)
  const store = new SqliteStore(db)
  store.initProject('knowledge-lint-test')
  store.close()
}

function run(args: string, dir: string): unknown {
  const raw = execSync(`npx tsx src/cli/index.ts ${args} --dir "${dir}"`, {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  return JSON.parse(raw)
}

describe('agf knowledge-lint CLI', () => {
  it('returns ok:true envelope with findings array (AC1)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'klint-'))
    try {
      initGraph(dir)
      const parsed = run('knowledge-lint --json', dir) as Record<string, unknown>
      expect(parsed.ok).toBe(true)
      expect(Array.isArray((parsed.data as Record<string, unknown>).findings)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('--select data.findings projects to just findings in data (AC2)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'klint-'))
    try {
      initGraph(dir)
      const parsed = run('knowledge-lint --select data.findings', dir) as Record<string, unknown>
      expect(parsed.ok).toBe(true)
      expect(Array.isArray((parsed.data as Record<string, unknown>).findings)).toBe(true)
      // meta is always retained but other data fields are absent
      expect((parsed.data as Record<string, unknown>).scanned).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('data.deleted is always 0 (AC3)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'klint-'))
    try {
      initGraph(dir)
      const parsed = run('knowledge-lint --json', dir) as Record<string, unknown>
      expect((parsed.data as Record<string, unknown>).deleted).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
