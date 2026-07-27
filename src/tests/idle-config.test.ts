import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveIdleShutdownMs, DEFAULT_DAEMON_IDLE_MS, createIdleWatcher } from '../core/daemon/idle-config.js'

describe('resolveIdleShutdownMs', () => {
  it('returns the default when env var is undefined', () => {
    expect(resolveIdleShutdownMs(undefined)).toBe(DEFAULT_DAEMON_IDLE_MS)
  })

  it('returns undefined for "0" — explicit opt-out', () => {
    expect(resolveIdleShutdownMs('0')).toBeUndefined()
  })

  it('returns the parsed value for a positive integer string', () => {
    expect(resolveIdleShutdownMs('30000')).toBe(30000)
    expect(resolveIdleShutdownMs('1')).toBe(1)
  })

  it('returns the default for garbage input', () => {
    expect(resolveIdleShutdownMs('not-a-number')).toBe(DEFAULT_DAEMON_IDLE_MS)
    expect(resolveIdleShutdownMs('')).toBe(DEFAULT_DAEMON_IDLE_MS)
  })

  it('returns the default for negative values — fail safe against leaks', () => {
    expect(resolveIdleShutdownMs('-1')).toBe(DEFAULT_DAEMON_IDLE_MS)
    expect(resolveIdleShutdownMs('-9999')).toBe(DEFAULT_DAEMON_IDLE_MS)
  })

  it('DEFAULT_DAEMON_IDLE_MS is 10 minutes', () => {
    expect(DEFAULT_DAEMON_IDLE_MS).toBe(10 * 60 * 1000)
  })
})

describe('createIdleWatcher', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns undefined when idleMs is undefined (explicit opt-out)', () => {
    const onIdle = vi.fn()
    expect(createIdleWatcher(undefined, onIdle)).toBeUndefined()
  })

  it('fires onIdle once elapsed time since the last touch() exceeds idleMs', () => {
    vi.useFakeTimers()
    const onIdle = vi.fn()
    const watcher = createIdleWatcher(1000, onIdle, { checkIntervalMs: 100 })
    expect(watcher).toBeDefined()

    vi.advanceTimersByTime(500)
    expect(onIdle).not.toHaveBeenCalled()

    vi.advanceTimersByTime(600)
    expect(onIdle).toHaveBeenCalledTimes(1)

    watcher?.stop()
  })

  it('touch() resets the idle clock, deferring onIdle', () => {
    vi.useFakeTimers()
    const onIdle = vi.fn()
    const watcher = createIdleWatcher(1000, onIdle, { checkIntervalMs: 100 })

    vi.advanceTimersByTime(900)
    watcher?.touch()
    vi.advanceTimersByTime(900)
    expect(onIdle).not.toHaveBeenCalled()

    vi.advanceTimersByTime(200)
    expect(onIdle).toHaveBeenCalledTimes(1)

    watcher?.stop()
  })

  it('stop() clears the interval so onIdle never fires afterwards', () => {
    vi.useFakeTimers()
    const onIdle = vi.fn()
    const watcher = createIdleWatcher(1000, onIdle, { checkIntervalMs: 100 })
    watcher?.stop()

    vi.advanceTimersByTime(5000)
    expect(onIdle).not.toHaveBeenCalled()
  })
})
