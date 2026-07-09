import { describe, it, expect, vi } from 'vitest'
import { openBrowser, shouldSkipAutoOpen } from '../core/web/open-browser.js'

describe('openBrowser', () => {
  it('calls spawn with "open" on darwin', () => {
    const spawn = vi.fn()
    openBrowser('http://localhost:3000', { platform: 'darwin', spawn })
    expect(spawn).toHaveBeenCalledWith('open', ['http://localhost:3000'])
  })

  it('calls spawn with "xdg-open" on linux', () => {
    const spawn = vi.fn()
    openBrowser('http://localhost:3001', { platform: 'linux', spawn })
    expect(spawn).toHaveBeenCalledWith('xdg-open', ['http://localhost:3001'])
  })

  it('calls spawn with "start" on win32', () => {
    const spawn = vi.fn()
    openBrowser('http://localhost:3002', { platform: 'win32', spawn })
    expect(spawn).toHaveBeenCalledWith('start', ['http://localhost:3002'])
  })

  it('does not throw when spawn is omitted (fire-and-forget default)', () => {
    // Default spawn uses real child_process — just check it does not throw sync.
    expect(() => openBrowser('http://localhost:3003')).not.toThrow()
  })

  it('node_777d4fa6d16c: a real ENOENT (missing browser command) does not crash the process asynchronously', async () => {
    // Force the real default spawn path with a command guaranteed not to exist,
    // simulating a headless/CI/container environment with no xdg-open/open.
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'freebsd' }) // -> 'xdg-open'-style branch (else arm)
    const uncaught: unknown[] = []
    const onUncaught = (err: unknown) => uncaught.push(err)
    process.once('uncaughtException', onUncaught)
    try {
      openBrowser('http://localhost:9999')
      // Give the async ENOENT 'error' event a chance to fire and (if unhandled) crash.
      await new Promise((resolve) => setTimeout(resolve, 200))
    } finally {
      process.removeListener('uncaughtException', onUncaught)
      Object.defineProperty(process, 'platform', { value: originalPlatform })
    }
    expect(uncaught).toHaveLength(0)
  })
})

describe('shouldSkipAutoOpen', () => {
  it('skips when CI env var is set', () => {
    expect(shouldSkipAutoOpen({ env: { CI: 'true' }, isTty: true })).toBe(true)
  })

  it('skips when any SSH_* env var is set', () => {
    expect(shouldSkipAutoOpen({ env: { SSH_CONNECTION: '203.0.113.4' }, isTty: true })).toBe(true)
  })

  it('skips when stdout is not a TTY (piped/redirected)', () => {
    expect(shouldSkipAutoOpen({ env: {}, isTty: false })).toBe(true)
  })

  it('does not skip in a normal interactive terminal with no CI/SSH markers', () => {
    expect(shouldSkipAutoOpen({ env: {}, isTty: true })).toBe(false)
  })
})
