/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_e525b629193a — file lock for concurrent pack/rebuild prevention.
 * Root cause of the better-sqlite3 offline-bundle corruption: two processes
 * (two sessions) modifying the same node_modules without a lock. Reuses
 * daemon-lockfile.ts's acquireLock/releaseLock (do not recreate).
 */

import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acquirePackLock, releasePackLock } from '../../scripts/pack-offline-lock.mjs'

const SCRIPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../scripts')

let dir: string

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('acquirePackLock / releasePackLock', () => {
  it('GIVEN no existing lock file THEN acquirePackLock succeeds and the lock file carries the current PID', () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-pack-lock-'))
    const lockPath = join(dir, '.pack-offline.lock')

    acquirePackLock(lockPath)

    expect(existsSync(lockPath)).toBe(true)
    expect(readFileSync(lockPath, 'utf-8').trim()).toBe(String(process.pid))
  })

  it('GIVEN an existing lock file with a live PID THEN a second acquirePackLock throws LOCK_HELD with the holder PID', () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-pack-lock-'))
    const lockPath = join(dir, '.pack-offline.lock')
    writeFileSync(lockPath, String(process.pid)) // our own PID is guaranteed alive

    expect(() => acquirePackLock(lockPath)).toThrow(/LOCK_HELD/)
    expect(() => acquirePackLock(lockPath)).toThrow(new RegExp(String(process.pid)))
  })

  it('GIVEN an existing lock file with a stale (dead) PID THEN acquirePackLock detects it and reclaims the lock', () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-pack-lock-'))
    const lockPath = join(dir, '.pack-offline.lock')
    // PID 999999 is astronomically unlikely to be alive on any test machine.
    writeFileSync(lockPath, '999999')

    expect(() => acquirePackLock(lockPath)).not.toThrow()
    expect(readFileSync(lockPath, 'utf-8').trim()).toBe(String(process.pid))
  })

  it('GIVEN a held lock THEN releasePackLock removes the lock file', () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-pack-lock-'))
    const lockPath = join(dir, '.pack-offline.lock')
    acquirePackLock(lockPath)

    releasePackLock(lockPath)

    expect(existsSync(lockPath)).toBe(false)
  })
})

describe('pack-offline.mjs wiring (static contract — the full script is too heavy to execute in a test)', () => {
  it('imports acquirePackLock/releasePackLock and calls acquirePackLock before any node_modules mutation', () => {
    const src = readFileSync(join(SCRIPTS_DIR, 'pack-offline.mjs'), 'utf-8')
    expect(src).toMatch(
      /import\s*\{\s*acquirePackLock,\s*releasePackLock\s*\}\s*from\s*['"]\.\/pack-offline-lock\.mjs['"]/,
    )
    expect(src).toMatch(/acquirePackLock\(LOCK_PATH\)/)
  })

  it("registers releasePackLock on process 'exit' (the finally-equivalent for a top-level script)", () => {
    const src = readFileSync(join(SCRIPTS_DIR, 'pack-offline.mjs'), 'utf-8')
    expect(src).toMatch(/process\.on\(['"]exit['"],\s*\(\)\s*=>\s*releasePackLock\(LOCK_PATH\)\)/)
  })
})
