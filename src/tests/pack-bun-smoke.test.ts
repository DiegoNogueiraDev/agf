/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Smoke + contract guard for the Bun standalone build (`scripts/pack-bun.mjs`).
 *
 * The compiled binary uses `bun:sqlite` (NOT a native better-sqlite3 `.node`) —
 * see {@link ../core/store/database-factory.ts} — so nothing native needs
 * embedding. The one thing `bun build --compile` gets WRONG on macOS is the
 * code signature: it appends the JS bundle AFTER the linker's ad-hoc signature
 * is written, invalidating it, so arm64 macOS rejects the binary as "damaged".
 * These tests lock the fix: `pack-bun.mjs` re-applies an ad-hoc signature to
 * the darwin target, and the shipped binary runs `--version` with NO Node on
 * PATH and carries a valid signature.
 */

import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync, copyFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'

import { signDarwinAdhoc } from '../../scripts/codesign-darwin.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const VERSION = (JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8')) as { version: string }).version
const isMac = process.platform === 'darwin'
const hostBinary = path.join(ROOT, 'dist-bun', 'agf-darwin-arm64')
const haveHostBinary = isMac && existsSync(hostBinary)

/** Strip Node from PATH so the test proves the binary needs no Node runtime. */
const NODELESS_PATH = '/usr/bin:/bin'

describe('signDarwinAdhoc', () => {
  it('no-ops for a non-darwin target', () => {
    const result = signDarwinAdhoc('/tmp/whatever', { targetOs: 'linux', hostPlatform: 'darwin' })
    expect(result.applied).toBe(false)
    expect(result.reason).toBe('not-darwin')
  })

  it('skips a darwin target when the build host is not macOS (codesign is mac-only)', () => {
    const result = signDarwinAdhoc('/tmp/whatever', { targetOs: 'darwin', hostPlatform: 'linux' })
    expect(result.applied).toBe(false)
    expect(result.reason).toBe('host-not-macos')
  })

  it.skipIf(!isMac)('produces a valid ad-hoc signature on a darwin binary', () => {
    const tmp = path.join(os.tmpdir(), `agf-codesign-${process.pid}`)
    copyFileSync('/bin/echo', tmp)
    try {
      const result = signDarwinAdhoc(tmp, { targetOs: 'darwin', hostPlatform: 'darwin' })
      expect(result.applied).toBe(true)
      const verify = spawnSync('codesign', ['--verify', '--strict', tmp], { encoding: 'utf-8' })
      expect(verify.status).toBe(0)
    } finally {
      rmSync(tmp, { force: true })
    }
  })
})

describe('pack-bun.mjs build wiring', () => {
  it('wires the darwin ad-hoc codesign step after compile', () => {
    const src = readFileSync(path.join(ROOT, 'scripts', 'pack-bun.mjs'), 'utf-8')
    expect(src).toContain('codesign-darwin')
    expect(src).toContain('signDarwinAdhoc')
  })
})

describe('built darwin binary (smoke)', () => {
  it.skipIf(!haveHostBinary)('runs `--version` with NO Node on PATH', () => {
    const r = spawnSync(hostBinary, ['--version'], { encoding: 'utf-8', env: { ...process.env, PATH: NODELESS_PATH } })
    expect(r.status).toBe(0)
    expect(r.stdout).toContain(VERSION)
  })

  it.skipIf(!haveHostBinary)('carries a valid (re-applied) ad-hoc code signature', () => {
    const verify = spawnSync('codesign', ['--verify', '--strict', hostBinary], { encoding: 'utf-8' })
    expect(verify.status).toBe(0)
  })
})
