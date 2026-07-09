/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect, vi } from 'vitest'
// @ts-expect-error — plain .mjs build helper, no type declarations
import { shouldEmbedIcon, embedWindowsIcon } from '../../scripts/win-icon.mjs'

describe('shouldEmbedIcon', () => {
  it('is true only for the win32 target', () => {
    expect(shouldEmbedIcon({ os: 'win32' })).toBe(true)
    expect(shouldEmbedIcon({ os: 'darwin' })).toBe(false)
    expect(shouldEmbedIcon({ os: 'linux' })).toBe(false)
    expect(shouldEmbedIcon(undefined)).toBe(false)
  })
})

describe('embedWindowsIcon', () => {
  it('invokes rcedit with the exe and the icon path', () => {
    const run = vi.fn()
    const res = embedWindowsIcon('/out/agf-windows-x64.exe', '/a/agf.ico', { run })
    expect(res.applied).toBe(true)
    expect(run).toHaveBeenCalledTimes(1)
    const [cmd, args] = run.mock.calls[0]
    expect(cmd).toBe('npx')
    expect(args).toContain('rcedit')
    expect(args).toContain('/out/agf-windows-x64.exe')
    expect(args).toContain('--set-icon')
    expect(args).toContain('/a/agf.ico')
  })

  it('fails open (applied=false, no throw) when rcedit is unavailable', () => {
    const run = () => {
      throw new Error('rcedit not found')
    }
    const res = embedWindowsIcon('/out/x.exe', '/a/agf.ico', { run })
    expect(res.applied).toBe(false)
    expect(res.reason).toMatch(/rcedit/)
  })
})
