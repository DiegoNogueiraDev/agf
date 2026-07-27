/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Tests for the self-update core: asset-name resolution per platform, semver
 * comparison, the upgrade decision, and the runner's verify-then-swap flow with
 * injected HTTP/FS ports (no network, no real binary touched).
 */
import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { resolveAssetName, compareVersions, planUpgrade } from '../core/upgrade/upgrade.js'
import { UpgradeError } from '../core/upgrade/upgrade-error.js'
import { runUpgrade, type UpgradePorts } from '../core/upgrade/upgrade-runner.js'

describe('resolveAssetName', () => {
  it('maps darwin/linux arches to the fixed release names', () => {
    expect(resolveAssetName('darwin', 'arm64')).toBe('agf-darwin-arm64')
    expect(resolveAssetName('darwin', 'x64')).toBe('agf-darwin-x64')
    expect(resolveAssetName('linux', 'arm64')).toBe('agf-linux-arm64')
    expect(resolveAssetName('linux', 'x64')).toBe('agf-linux-x64')
  })
  // v0.24.0 retired the Windows binary. The failure mode this guards is the
  // silent one: a user still on the 0.23.x `.exe` runs `agf upgrade`, the
  // asset 404s, and they get a download error that says nothing about WHY.
  // Refusing at name-resolution turns that dead end into the migration command.
  it('refuses windows and points at the Node installer instead of naming an .exe', () => {
    expect(() => resolveAssetName('win32', 'x64')).toThrow(UpgradeError)
    expect(() => resolveAssetName('win32', 'x64')).toThrow(/install\.ps1/)
    let message = ''
    try {
      resolveAssetName('win32', 'x64')
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).not.toMatch(/\.exe/)
  })
  it('throws on an unsupported platform/arch', () => {
    expect(() => resolveAssetName('freebsd', 'x64')).toThrow()
    expect(() => resolveAssetName('linux', 'ia32')).toThrow()
  })
})

describe('compareVersions', () => {
  it('orders semver correctly', () => {
    expect(compareVersions('0.20.3', '0.20.2')).toBeGreaterThan(0)
    expect(compareVersions('0.20.2', '0.20.3')).toBeLessThan(0)
    expect(compareVersions('0.20.3', '0.20.3')).toBe(0)
    expect(compareVersions('1.0.0', '0.99.99')).toBeGreaterThan(0)
  })

  // Regression: a leading 'v' (GitHub release tags, process.version) must not corrupt the
  // compare. parseInt('v1') is NaN -> 0, which flipped 1.0.0 below 0.9.0 and broke equality.
  it("strips a leading 'v' so v-prefixed semver compares numerically", () => {
    expect(compareVersions('v1.0.0', '0.9.0')).toBeGreaterThan(0)
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0', 'v1.0.0')).toBe(0)
    expect(compareVersions('v0.22.3', 'v0.22.2')).toBeGreaterThan(0)
    expect(compareVersions('V2.0.0', 'v1.9.9')).toBeGreaterThan(0) // uppercase V too
  })
})

describe('planUpgrade', () => {
  it('upgrades when remote is newer', () => {
    expect(planUpgrade({ current: '0.20.2', remote: '0.20.3' }).shouldUpgrade).toBe(true)
  })
  it('skips when already current', () => {
    const p = planUpgrade({ current: '0.20.3', remote: '0.20.3' })
    expect(p.shouldUpgrade).toBe(false)
    expect(p.reason).toMatch(/up.to.date/i)
  })
  it('skips when remote is older', () => {
    expect(planUpgrade({ current: '0.20.3', remote: '0.20.2' }).shouldUpgrade).toBe(false)
  })
  it('forces re-install regardless of version when force=true', () => {
    expect(planUpgrade({ current: '0.20.3', remote: '0.20.3', force: true }).shouldUpgrade).toBe(true)
  })
})

function makePorts(over: Partial<UpgradePorts> & { binary: Buffer }): UpgradePorts {
  const sum = createHash('sha256').update(over.binary).digest('hex')
  return {
    platform: 'darwin',
    arch: 'arm64',
    currentVersion: '0.20.2',
    execPath: '/usr/local/bin/agf',
    fetchText: vi.fn(async (url: string) => {
      if (url.endsWith('/BUILDINFO')) return JSON.stringify({ version: '0.20.3' })
      if (url.endsWith('.sha256')) return `${sum}  agf-darwin-arm64\n`
      throw new Error('unexpected text url ' + url)
    }),
    fetchBinary: vi.fn(async () => over.binary),
    swapBinary: vi.fn(async () => {}),
    ...over,
  }
}

describe('runUpgrade', () => {
  it('downloads, verifies the checksum, and swaps the binary', async () => {
    const binary = Buffer.from('NEW-BINARY-BYTES')
    const ports = makePorts({ binary })
    const res = await runUpgrade(ports)
    expect(res.ok).toBe(true)
    expect(res.upgraded).toBe(true)
    expect(res.from).toBe('0.20.2')
    expect(res.to).toBe('0.20.3')
    expect(ports.swapBinary).toHaveBeenCalledOnce()
    expect(ports.swapBinary).toHaveBeenCalledWith('/usr/local/bin/agf', binary)
  })

  // Consumer-mode proof for the retired Windows channel: the unit test above only
  // shows resolveAssetName throws. What a stranded 0.23.x user actually experiences
  // is this — a structured refusal carrying the migration command, and crucially NO
  // download attempt and NO binary swap against a URL that now 404s.
  it('tells a Windows user how to migrate instead of fetching a retired asset', async () => {
    const ports = makePorts({ binary: Buffer.from('x'), platform: 'win32', arch: 'x64' })
    const res = await runUpgrade(ports)
    expect(res.ok).toBe(false)
    expect(res.code).toBe('UNSUPPORTED_PLATFORM')
    expect(res.error).toMatch(/install\.ps1/)
    expect(ports.fetchBinary).not.toHaveBeenCalled()
    expect(ports.swapBinary).not.toHaveBeenCalled()
  })

  it('refuses to swap when the checksum does not match (tamper/corruption)', async () => {
    const binary = Buffer.from('NEW-BINARY-BYTES')
    const ports = makePorts({ binary })
    ports.fetchText = vi.fn(async (url: string) =>
      url.endsWith('/BUILDINFO') ? JSON.stringify({ version: '0.20.3' }) : 'deadbeef  agf-darwin-arm64\n',
    )
    const res = await runUpgrade(ports)
    expect(res.ok).toBe(false)
    expect(res.code).toBe('CHECKSUM_MISMATCH')
    expect(ports.swapBinary).not.toHaveBeenCalled()
  })

  it('does nothing when already up to date', async () => {
    const ports = makePorts({ binary: Buffer.from('x'), currentVersion: '0.20.3' })
    const res = await runUpgrade(ports)
    expect(res.ok).toBe(true)
    expect(res.upgraded).toBe(false)
    expect(ports.fetchBinary).not.toHaveBeenCalled()
    expect(ports.swapBinary).not.toHaveBeenCalled()
  })
})
