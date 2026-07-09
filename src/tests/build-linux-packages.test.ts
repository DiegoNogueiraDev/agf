/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Static contract test for scripts/build-linux-packages.sh (node_d02c01bd85a4):
 * builds and Docker-verifies a .deb and an AppImage from the self-contained
 * dist-bun/agf-linux-x64 binary. A real Docker build was run manually to
 * prove the end-to-end path (dpkg -i / AppImage execution in a clean Ubuntu
 * container) — see the pheromone-linux-packages memory for the run log.
 * This test asserts the script's structure and safety properties.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SCRIPT = join(process.cwd(), 'scripts', 'build-linux-packages.sh')
const src = existsSync(SCRIPT) ? readFileSync(SCRIPT, 'utf8') : ''

describe('scripts/build-linux-packages.sh (Linux .deb + AppImage packaging)', () => {
  it('exists and is executable', () => {
    expect(existsSync(SCRIPT)).toBe(true)
    expect(statSync(SCRIPT).mode & 0o111).not.toBe(0)
  })

  it('requires the self-contained dist-bun/agf-linux-x64 binary as payload', () => {
    expect(src).toContain('dist-bun/agf-linux-x64')
    expect(src).toMatch(/if \[ ! -f "\$BIN" \]/)
  })

  it('builds the .deb via dpkg-deb inside Docker (not relying on macOS host tools)', () => {
    expect(src).toMatch(/build_deb\(\) \{/)
    expect(src).toContain('dpkg-deb --build')
    expect(src).toContain('ubuntu:22.04')
  })

  it('verifies the .deb by actually installing it in a fresh container and running agf --version', () => {
    const fn = src.slice(src.indexOf('build_deb() {'), src.indexOf('build_appimage() {'))
    expect(fn).toMatch(/dpkg -i \/out\/agf_\$\{VERSION\}_amd64\.deb/)
    expect(fn).toMatch(/agf --version/)
  })

  it('builds the AppImage natively (aarch64 appimagetool) targeting x86_64 output', () => {
    expect(src).toMatch(/build_appimage\(\) {/)
    expect(src).toContain('appimagetool-aarch64.AppImage')
    expect(src).toContain('ARCH=x86_64')
    expect(src).toContain('AppDir')
  })

  it('confirms the built AppImage is a valid x86_64 ELF via `file`', () => {
    const fn = src.slice(src.indexOf('build_appimage() {'))
    expect(fn).toMatch(/file \/out\/agf-\$\{VERSION\}-x86_64\.AppImage/)
  })

  it('supports building each target independently or both together', () => {
    expect(src).toMatch(/deb\)\s*build_deb\s*;;/)
    expect(src).toMatch(/appimage\)\s*build_appimage\s*;;/)
    expect(src).toMatch(/all\)\s*build_deb;\s*build_appimage\s*;;/)
  })
})
