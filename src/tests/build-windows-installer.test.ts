/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Real (not static-only) test for scripts/build-windows-installer.sh
 * (node_0981fdbafdde): runs the actual build (makensis inside Docker — NSIS
 * compiles a Windows .exe without needing Windows itself) and verifies the
 * output is a genuine PE32 installer via `file`.
 *
 * Execution of the resulting .exe could NOT be verified here — it needs a
 * real Windows host or Wine, and Wine-on-ARM64-Linux would add a third
 * emulation layer on top of Docker's Rosetta/QEMU layer (the same class of
 * limitation hit by the AppImage packaging task). See the pheromone memory.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const SCRIPT = join(ROOT, 'scripts', 'build-windows-installer.sh')
const BIN = join(ROOT, 'dist-bun', 'agf-windows-x64.exe')
const PACKAGE_JSON_VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version as string
const OUTPUT_PATH = join(ROOT, 'dist-packages', `agf-setup-${PACKAGE_JSON_VERSION}-x64.exe`)
const hasBinary = existsSync(BIN)

// The real build compiles the .exe with makensis inside Docker. A host without Docker (a dev Mac)
// cannot run it — CI (self-hosted, Docker present) can. Gate the real-build suite on Docker being
// available so the source-contract tests still run everywhere; probed at load time for skipIf.
function dockerAvailable(): boolean {
  try {
    execFileSync('docker', ['info'], { stdio: 'pipe', timeout: 10_000 })
    return true
  } catch {
    return false
  }
}
const canRealBuild = hasBinary && dockerAvailable()

beforeAll(() => {
  if (!canRealBuild) return
  execFileSync('bash', [SCRIPT], { cwd: ROOT, stdio: 'pipe', timeout: 120_000 })
}, 120_000)

afterAll(() => {
  // Remove only THIS test's artifact — a `rm -rf dist-packages` races the macos-pkg test's build
  // in a parallel worker (both write to the shared dist-packages/ dir).
  rmSync(OUTPUT_PATH, { force: true })
})

describe.skipIf(!canRealBuild)('build-windows-installer.sh — real build against makensis', () => {
  it('produces the setup .exe', () => {
    expect(existsSync(OUTPUT_PATH)).toBe(true)
  })

  it('is a genuine PE32 Windows executable', () => {
    const type = execFileSync('file', ['-b', OUTPUT_PATH], { encoding: 'utf8' })
    expect(type).toContain('PE32')
    expect(type).toMatch(/Windows/)
  })

  it('is meaningfully smaller than the raw payload (zlib-compressed)', () => {
    const payloadSize = execFileSync('stat', ['-f', '%z', BIN], { encoding: 'utf8' }).trim()
    const outputSize = execFileSync('stat', ['-f', '%z', OUTPUT_PATH], { encoding: 'utf8' }).trim()
    expect(Number(outputSize)).toBeLessThan(Number(payloadSize))
  })
})

describe('scripts/build-windows-installer.sh + windows-installer.nsi — source contract', () => {
  const shSrc = existsSync(SCRIPT) ? readFileSync(SCRIPT, 'utf8') : ''
  const nsiPath = join(ROOT, 'scripts', 'windows-installer.nsi')
  const nsiSrc = existsSync(nsiPath) ? readFileSync(nsiPath, 'utf8') : ''

  it('both files exist', () => {
    expect(existsSync(SCRIPT)).toBe(true)
    expect(existsSync(nsiPath)).toBe(true)
  })

  it('compiles via makensis inside Docker (no native Windows/Wine needed to build)', () => {
    expect(shSrc).toContain('makensis')
    expect(shSrc).toContain('ubuntu:22.04')
  })

  it('installs per-user (RequestExecutionLevel user) — no admin elevation needed', () => {
    expect(nsiSrc).toContain('RequestExecutionLevel user')
  })

  it('adds the install dir to the user PATH (HKCU, broadcasts WM_SETTINGCHANGE)', () => {
    expect(nsiSrc).toContain('HKCU')
    expect(nsiSrc).toContain('"Environment"')
    expect(nsiSrc).toContain('WM_SETTINGCHANGE')
  })

  it('never signs the installer (unsigned by design decision)', () => {
    expect(nsiSrc).not.toMatch(/signtool|Sign\b/)
  })

  it('ships an uninstaller', () => {
    expect(nsiSrc).toContain('WriteUninstaller')
    expect(nsiSrc).toMatch(/Section "Uninstall"/)
  })
})
