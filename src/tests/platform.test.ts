/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../core/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}))

const mockExecFileSync = vi.fn()
vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync,
}))

describe('IS_WINDOWS', () => {
  it('should reflect current platform', async () => {
    const { IS_WINDOWS } = await import('../core/utils/platform.js')
    expect(IS_WINDOWS).toBe(process.platform === 'win32')
  })
})

describe('whichCommand', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('should return "which" on non-Windows', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' })
    const { whichCommand } = await import('../core/utils/platform.js')
    expect(whichCommand()).toBe('which')
    vi.unstubAllGlobals()
  })

  it('should return "where" on Windows', async () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' })
    const { whichCommand } = await import('../core/utils/platform.js')
    expect(whichCommand()).toBe('where')
    vi.unstubAllGlobals()
  })
})

describe('killProcess', () => {
  beforeEach(() => {
    vi.resetModules()
    mockExecFileSync.mockReset()
  })

  it('should do nothing for null/undefined process', async () => {
    const { killProcess } = await import('../core/utils/platform.js')
    expect(() => killProcess(null as any)).not.toThrow()
    expect(() => killProcess(undefined as any)).not.toThrow()
  })

  it('should do nothing for already killed process', async () => {
    const { killProcess } = await import('../core/utils/platform.js')
    const proc = { killed: true } as any
    expect(() => killProcess(proc)).not.toThrow()
  })

  it('should call SIGTERM on non-Windows', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' })
    const { killProcess } = await import('../core/utils/platform.js')
    const kill = vi.fn()
    const proc = { killed: false, pid: 1234, kill } as any
    killProcess(proc)
    expect(kill).toHaveBeenCalledWith('SIGTERM')
    vi.unstubAllGlobals()
  })

  it('should call taskkill on Windows', async () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' })
    const { killProcess } = await import('../core/utils/platform.js')
    const proc = { killed: false, pid: 5678 } as any
    killProcess(proc)
    expect(mockExecFileSync).toHaveBeenCalledWith('taskkill', ['/pid', '5678', '/T', '/F'])
    vi.unstubAllGlobals()
  })

  it('should not throw when taskkill fails on Windows', async () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' })
    mockExecFileSync.mockImplementation(() => {
      throw new Error('access denied')
    })
    const { killProcess } = await import('../core/utils/platform.js')
    const proc = { killed: false, pid: 9999 } as any
    expect(() => killProcess(proc)).not.toThrow()
    vi.unstubAllGlobals()
  })
})
