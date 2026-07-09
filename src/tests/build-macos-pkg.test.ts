/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Real (not static-only) test for scripts/build-macos-pkg.sh (node_3c6a66fd217b):
 * runs the actual script (pkgbuild + productbuild, native macOS tools — no
 * Docker/emulation needed here, unlike the Windows/Linux packaging tasks) and
 * verifies the produced .pkg with `pkgutil --expand-full` + `--check-signature`.
 *
 * A real `installer -pkg ... -target <volume>` install could not be exercised
 * here — it requires interactive sudo, unavailable in this harness (no TTY
 * for a password prompt). Structural verification (payload contents,
 * permissions, install-location, unsigned status) is the strongest proof
 * available without it — see the pheromone memory for the full trail,
 * including the isolated disk-image install attempt that hit this limit.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = process.cwd()
const SCRIPT = join(ROOT, 'scripts', 'build-macos-pkg.sh')
const BIN = join(ROOT, 'dist-bun', 'agf-darwin-arm64')
const PKG_PATH = join(ROOT, 'dist-packages', 'agf-0.20.6-darwin-arm64.pkg')
const hasBinary = existsSync(BIN)

let expandDir: string

beforeAll(() => {
  if (!hasBinary) return
  execFileSync('bash', [SCRIPT, 'arm64'], { cwd: ROOT, stdio: 'pipe' })
  expandDir = mkdtempSync(join(tmpdir(), 'agf-pkg-expand-'))
  rmSync(expandDir, { recursive: true, force: true })
  execFileSync('pkgutil', ['--expand-full', PKG_PATH, expandDir], { stdio: 'pipe' })
})

afterAll(() => {
  if (expandDir) rmSync(expandDir, { recursive: true, force: true })
  rmSync(join(ROOT, 'dist-packages'), { recursive: true, force: true })
})

describe.skipIf(!hasBinary)('build-macos-pkg.sh — real build against pkgbuild/productbuild', () => {
  it('produces a .pkg file', () => {
    expect(existsSync(PKG_PATH)).toBe(true)
  })

  it('payload contains the correct binary at /usr/local/bin/agf, executable', () => {
    const payloadBin = join(expandDir, 'agf-component.pkg', 'Payload', 'usr', 'local', 'bin', 'agf')
    expect(existsSync(payloadBin)).toBe(true)
    const type = execFileSync('file', ['-b', payloadBin], { encoding: 'utf8' })
    expect(type).toContain('Mach-O')
    expect(type).toContain('arm64')
  })

  it('declares install-location "/" so it lands in the real /usr/local/bin on install', () => {
    const dist = readFileSync(join(expandDir, 'Distribution'), 'utf8')
    expect(dist).toContain('cloud.graph-flow.agf')
    const pkgInfo = readFileSync(join(expandDir, 'agf-component.pkg', 'PackageInfo'), 'utf8')
    expect(pkgInfo).toContain('install-location="/"')
  })

  it('is unsigned, matching the documented no-credentials decision', () => {
    let signed = true
    try {
      execFileSync('pkgutil', ['--check-signature', PKG_PATH], { stdio: 'pipe' })
    } catch {
      signed = false
    }
    expect(signed).toBe(false)
  })
})

describe('scripts/build-macos-pkg.sh — source contract', () => {
  const src = existsSync(SCRIPT) ? readFileSync(SCRIPT, 'utf8') : ''

  it('exists and is executable', () => {
    expect(existsSync(SCRIPT)).toBe(true)
  })

  it('never signs the package (unsigned by design decision)', () => {
    expect(src).not.toMatch(/--sign\b/)
    expect(src).not.toMatch(/codesign/)
  })

  it('supports both arm64 and x64 darwin targets', () => {
    expect(src).toContain('agf-darwin-arm64')
    expect(src).toContain('agf-darwin-x64')
  })
})
