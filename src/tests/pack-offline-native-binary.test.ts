/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Regression test for node_a8aff73b3be2 (CRITICAL): every offline .tgz ever
 * produced by pack-offline.mjs silently shipped WITHOUT the compiled
 * better_sqlite3.node — confirmed by two independent bugs:
 *   (1) `npm pack` filters bundledDependencies by each dep's own `files`
 *       allowlist; better-sqlite3's list omits `build/Release/**`.
 *   (2) `npm pack` does not read live node_modules disk content for a
 *       bundledDependencies package at all (proven with a text-marker repro) —
 *       so the OLD "swap the binary in node_modules before packing" strategy
 *       for cross-platform targets never worked, even with (1) fixed.
 *
 * This is a static contract test (no test-infra for a top-level build
 * script) plus a real, slow integration run is exercised manually — see the
 * pheromone-pack-offline-sqlite-binary-bug memory for the full manual
 * verification trail (all 5 targets: darwin-arm64 native + darwin-x64,
 * linux-x64, linux-arm64, win32-x64 cross-compiled, each checked with `file`
 * against the real prebuilt binary format).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const SCRIPT = join(process.cwd(), 'scripts', 'pack-offline.mjs')
const src = existsSync(SCRIPT) ? readFileSync(SCRIPT, 'utf8') : ''

describe('scripts/pack-offline.mjs — better-sqlite3 native binary regression', () => {
  it('exists', () => {
    expect(existsSync(SCRIPT)).toBe(true)
  })

  it('patches the bundled dep files[] allowlist to include the compiled binary (bug 1 fix)', () => {
    expect(src).toMatch(/function patchDepFilesToIncludeBuild/)
    expect(src).toContain("patchDepFilesToIncludeBuild('better-sqlite3', 'build/Release/**')")
  })

  it('restores the patched files[] after packing, never leaving node_modules mutated', () => {
    const finallyBlock = src.slice(src.indexOf('} finally {', src.indexOf('npm pack --ignore-scripts')))
    expect(finallyBlock).toContain('sqliteFilesPatch.depPkgPath')
    expect(finallyBlock).toContain('sqliteFilesPatch.original')
  })

  it('does NOT swap the cross-target binary into node_modules (bug 2 — npm pack ignores it)', () => {
    expect(src).not.toMatch(/function downloadAndInjectSqlite/)
    expect(src).toMatch(/function downloadPrebuiltSqlite/)
  })

  it('post-processes the already-packed tarball to stitch in the cross-target binary', () => {
    expect(src).toMatch(/function injectSqliteBinaryIntoTarball/)
    expect(src).toContain('injectSqliteBinaryIntoTarball(join(OUT, packedName), prebuiltSqlitePath)')
  })

  it('verifies gzip integrity before swapping the repacked tarball into place', () => {
    const fn = src.slice(src.indexOf('function injectSqliteBinaryIntoTarball'))
    expect(fn).toMatch(/gzip -t/)
    expect(fn).toMatch(/renameSync\(tmpOut, tgzPath\)/)
  })
})

describe('scripts/gen-packages.sh — covers every cross-compile target', () => {
  const shPath = join(process.cwd(), 'scripts', 'gen-packages.sh')
  const shSrc = existsSync(shPath) ? readFileSync(shPath, 'utf8') : ''

  it('exists', () => {
    expect(existsSync(shPath)).toBe(true)
  })

  it('builds linux x64/arm64, darwin x64, and win32 x64 (darwin-arm64 is native, built elsewhere)', () => {
    expect(shSrc).toContain('build_target linux x64')
    expect(shSrc).toContain('build_target linux arm64')
    expect(shSrc).toContain('build_target darwin x64')
    expect(shSrc).toContain('build_target win32 x64')
  })
})

describe('.github/workflows/package-offline.yml — publishes every target to the Release', () => {
  const ymlPath = join(process.cwd(), '.github/workflows/package-offline.yml')
  const ymlSrc = existsSync(ymlPath) ? readFileSync(ymlPath, 'utf8') : ''

  it('runs gen-packages.sh to produce the cross-compiled targets', () => {
    expect(ymlSrc).toContain('bash scripts/gen-packages.sh all')
  })

  it('uploads and attaches every agf-offline-*.tgz produced, not just one platform', () => {
    expect(ymlSrc).toMatch(/dist-offline\/agf-offline-\*\.tgz/)
  })
})
