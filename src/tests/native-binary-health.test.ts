/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_3dc3270c6735 — native binary health-check (magic bytes) before
 * critical ops. The bug: better-sqlite3.node was swapped by a concurrent
 * `pack-offline.mjs --target-platform=win32` run (DLL replaced the real
 * native binary) — the resulting dlopen error was cryptic and only noticed
 * manually. checkNativeBinary reads the first 4 bytes and compares against
 * the known-valid native formats (ELF for Linux, Mach-O for macOS — NOT ELF
 * for both as the task's own wording implied; verified empirically against
 * this machine's real better-sqlite3.node, which is Mach-O 64-bit).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkNativeBinary } from '../core/store/native-binary-health.js'

describe('checkNativeBinary', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-native-binary-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('GIVEN a valid ELF binary (Linux) THEN result.ok === true', () => {
    const p = join(dir, 'linux.node')
    writeFileSync(p, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]))
    expect(checkNativeBinary(p)).toEqual({ ok: true })
  })

  it('GIVEN a valid Mach-O 64-bit binary (macOS) THEN result.ok === true', () => {
    const p = join(dir, 'macos.node')
    writeFileSync(p, Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x07, 0x00, 0x00, 0x01]))
    expect(checkNativeBinary(p)).toEqual({ ok: true })
  })

  it("GIVEN a Windows MZ/DLL binary (wrong platform) THEN result.ok === false with 'magic bytes mismatch' and 'npm rebuild'", () => {
    const p = join(dir, 'windows.node')
    writeFileSync(p, Buffer.from([0x4d, 0x5a, 0x90, 0x00]))
    const result = checkNativeBinary(p)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('magic bytes mismatch')
    expect(result.reason).toContain('npm rebuild')
  })

  it("GIVEN a missing binary THEN result.ok === false and result.reason === 'missing'", () => {
    const result = checkNativeBinary(join(dir, 'does-not-exist.node'))
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('missing')
  })
})
