import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { watchParentDeath } from '../core/daemon/parent-watch.js'

describe('watchParentDeath', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns a handle with a stop method', () => {
    const handle = watchParentDeath(() => {}, {
      readPpid: () => 1,
      pollMs: 100,
    })
    expect(typeof handle.stop).toBe('function')
    handle.stop()
  })

  it('calls onDeath when ppid changes to 1', async () => {
    const onDeath = vi.fn()
    let ppid = 9999
    watchParentDeath(onDeath, {
      readPpid: () => ppid,
      pollMs: 100,
    })
    ppid = 1
    await vi.advanceTimersByTimeAsync(150)
    expect(onDeath).toHaveBeenCalled()
  })

  it('does not call onDeath while ppid is stable', async () => {
    const onDeath = vi.fn()
    watchParentDeath(onDeath, {
      readPpid: () => 9999,
      pollMs: 100,
    })
    await vi.advanceTimersByTimeAsync(500)
    expect(onDeath).not.toHaveBeenCalled()
  })

  it('stop prevents further polling', async () => {
    const onDeath = vi.fn()
    let ppid = 9999
    const handle = watchParentDeath(onDeath, {
      readPpid: () => ppid,
      pollMs: 100,
    })
    handle.stop()
    ppid = 1
    await vi.advanceTimersByTimeAsync(500)
    expect(onDeath).not.toHaveBeenCalled()
  })

  it('uses process.ppid by default (smoke test)', () => {
    const handle = watchParentDeath(() => {}, { pollMs: 999_999 })
    expect(handle.stop).toBeDefined()
    handle.stop()
  })
})
