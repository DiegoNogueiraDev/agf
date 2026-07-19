/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Static contract test for scripts/install-agf-standalone.sh (node_f6e5e24c578b).
 * A real subprocess exercise (fixture HTTP server + spawnSync bash) was tried
 * first but this sandbox blocks network calls from a nested child process
 * (curl via spawnSync hangs even against 127.0.0.1) — confirmed by isolating a
 * bare `spawnSync('curl', ...)` against a local Node http server, which hangs
 * identically. Manual `bash scripts/install-agf-standalone.sh` from the Bash
 * tool directly (not nested) DOES work end-to-end (verified once against a
 * local python http.server fixture). Falling back to the same static-contract
 * pattern as install-agf-ps1.test.ts: prove the AC by reading the script
 * source, not executing it.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SCRIPT = join(process.cwd(), 'scripts', 'install-agf-standalone.sh')

describe('scripts/install-agf-standalone.sh (macOS/Linux one-liner installer)', () => {
  it('exists and is executable', () => {
    expect(existsSync(SCRIPT)).toBe(true)
    const mode = statSync(SCRIPT).mode
    expect(mode & 0o111).not.toBe(0)
  })

  const src = existsSync(SCRIPT) ? readFileSync(SCRIPT, 'utf8') : ''

  it('downloads the fixed-name os/arch binary from the public releases base', () => {
    expect(src).toContain('https://graph-flow.cloud/releases')
    // Overridable, so nobody is forced through the author's host.
    expect(src).toContain('AGF_RELEASES_BASE')
    expect(src).toMatch(/ASSET_NAME="agf-\$\{OS\}-\$\{ARCH\}"/)
  })

  it('computes and verifies SHA256 before trusting the download', () => {
    expect(src).toMatch(/sha256sum|shasum -a 256/)
    expect(src).toMatch(/EXPECTED_HASH/)
    expect(src).toMatch(/ACTUAL_HASH/)
  })

  it('rejects on checksum mismatch without installing, exiting non-zero', () => {
    const mismatchBlock = src.slice(src.indexOf('ACTUAL_HASH" != "$EXPECTED_HASH'))
    expect(mismatchBlock).toMatch(/Checksum mismatch/)
    expect(mismatchBlock.slice(0, 200)).toMatch(/exit 1/)
  })

  it('defensively strips the macOS quarantine attribute before install', () => {
    expect(src).toMatch(/xattr -rd com\.apple\.quarantine/)
  })

  it('installs to a PATH-worthy dir and reports success at exit 0', () => {
    expect(src).toMatch(/chmod \+x/)
    expect(src).toMatch(/mv -f "\$TMP_BIN" "\$TARGET_BIN"/)
    expect(src.trim().endsWith('exit 0')).toBe(true)
  })

  it('supports AGF_RELEASES_BASE / AGF_INSTALL_DIR overrides for testability', () => {
    expect(src).toContain('AGF_RELEASES_BASE')
    expect(src).toContain('AGF_INSTALL_DIR')
  })
})
