/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Static contract test for scripts/install-agf.ps1 (no pwsh runtime in CI): asserts the
 * AC from node_52a059aad7f2 — SHA256 verification before install, Unblock-File to drop
 * the Mark-of-the-Web (avoids SmartScreen), and a user-PATH update — by reading the
 * script source, not executing it.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const SCRIPT = join(process.cwd(), 'scripts', 'install-agf.ps1')

describe('scripts/install-agf.ps1 (Windows one-liner installer)', () => {
  it('exists', () => {
    expect(existsSync(SCRIPT)).toBe(true)
  })

  const src = existsSync(SCRIPT) ? readFileSync(SCRIPT, 'utf8') : ''

  it('downloads the fixed-name windows binary from the public releases base', () => {
    expect(src).toContain('https://graph-flow.cloud/releases')
    // Overridable, so nobody is forced through the author's host.
    expect(src).toContain('AGF_RELEASES_BASE')
    expect(src).toContain('agf-windows-x64.exe')
  })

  it('computes and verifies SHA256 before trusting the download', () => {
    expect(src).toMatch(/Get-FileHash/)
    expect(src).toMatch(/SHA256/)
  })

  it('rejects and removes the file on checksum mismatch, exiting non-zero', () => {
    const mismatchBlock = src.slice(src.indexOf('Get-FileHash'))
    expect(mismatchBlock).toMatch(/Remove-Item/)
    expect(mismatchBlock).toMatch(/exit 1/)
  })

  it('unblocks the downloaded exe to drop the Mark-of-the-Web (no SmartScreen prompt)', () => {
    expect(src).toMatch(/Unblock-File/)
  })

  it('adds the install dir to the user PATH', () => {
    expect(src).toMatch(/\[Environment\]::SetEnvironmentVariable\(\s*['"]Path['"]/)
    expect(src).toMatch(/['"]User['"]/)
  })

  it('exits 0 and prints agf --version on success', () => {
    const tail = src.slice(src.lastIndexOf('Unblock-File'))
    expect(tail).toMatch(/agf/)
    expect(tail).toMatch(/exit 0/)
  })
})
