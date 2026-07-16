import { describe, it, expect, vi, afterEach } from 'vitest'
import { HookBus } from '../core/hooks/hook-bus.js'
import { HookRegistry, HookCircuitOpenError } from '../core/hooks/hook-registry.js'
import type { HookEvent, HookChannel } from '../core/hooks/hook-types.js'

function makeEvent(channel: HookChannel, overrides: Partial<HookEvent> = {}): HookEvent {
  return { channel, timestamp: new Date().toISOString(), payload: {}, ...overrides }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('HookBus integration', () => {
  it('routes events through bus to registered handlers', async () => {
    const bus = new HookBus()
    const handler = vi.fn()
    bus.on('task:post-complete', handler)

    const event = makeEvent('task:post-complete', { payload: { nodeId: 'n1' } })
    await bus.emit(event)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(event)
  })

  it('supports multiple handlers on same channel', async () => {
    const bus = new HookBus()
    const h1 = vi.fn()
    const h2 = vi.fn()
    bus.on('task:pre-execute', h1)
    bus.on('task:pre-execute', h2)

    await bus.emit(makeEvent('task:pre-execute'))
    expect(h1).toHaveBeenCalledTimes(1)
    expect(h2).toHaveBeenCalledTimes(1)
  })

  it('isolates errors between handlers', async () => {
    const bus = new HookBus()
    const good = vi.fn()
    const bad = vi.fn().mockRejectedValue(new Error('fail'))
    const alsoGood = vi.fn()
    bus.on('session:start', good)
    bus.on('session:start', bad)
    bus.on('session:start', alsoGood)

    await bus.emit(makeEvent('session:start'))
    expect(good).toHaveBeenCalledTimes(1)
    expect(bad).toHaveBeenCalledTimes(1)
    expect(alsoGood).toHaveBeenCalledTimes(1)
  })

  it('supports sync emit (emitSync)', () => {
    const bus = new HookBus()
    const handler = vi.fn()
    bus.on('scaffold:requested', handler)

    bus.emitSync(makeEvent('scaffold:requested', { payload: { nodeId: 'n2' } }))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('tracks listener count', () => {
    const bus = new HookBus()
    const h = vi.fn()
    expect(bus.listenerCount('task:error')).toBe(0)
    bus.on('task:error', h)
    expect(bus.listenerCount('task:error')).toBe(1)
    bus.off('task:error', h)
    expect(bus.listenerCount('task:error')).toBe(0)
  })

  it('off on unregistered channel does not throw', () => {
    const bus = new HookBus()
    expect(() => bus.off('task:error', vi.fn())).not.toThrow()
  })
})

describe('HookRegistry circuit breaker', () => {
  it('opens circuit after maxFailures within window', async () => {
    const registry = new HookRegistry({
      windowMs: 60000,
      maxFailures: 3,
      timeoutMs: 10,
    })

    let callCount = 0
    const handler = vi.fn(async () => {
      callCount++
      await new Promise((r) => setTimeout(r, 100))
    })
    registry.register({ id: 'slow-handler', channel: 'task:post-complete', handler, priority: 1 })

    // First 3 calls time out
    for (let i = 0; i < 3; i++) {
      await expect(registry.dispatch(makeEvent('task:post-complete'))).rejects.toThrow()
    }
    expect(callCount).toBe(3)

    // 4th call should immediately throw circuit open
    await expect(registry.dispatch(makeEvent('task:post-complete'))).rejects.toThrow(HookCircuitOpenError)
  })

  it('auto-resets circuit after windowMs passes', async () => {
    const registry = new HookRegistry({
      windowMs: 50,
      maxFailures: 2,
      timeoutMs: 10,
    })

    const handler = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })
    registry.register({ id: 'reset-handler', channel: 'session:end', handler, priority: 1 })

    for (let i = 0; i < 2; i++) {
      await expect(registry.dispatch(makeEvent('session:end'))).rejects.toThrow()
    }

    // Circuit is open - dispatch throws HookCircuitOpenError
    await expect(registry.dispatch(makeEvent('session:end'))).rejects.toThrow(HookCircuitOpenError)

    // Wait for window to pass
    await new Promise((r) => setTimeout(r, 100))

    // Unregister old handler, register a fast one
    registry.unregister('reset-handler')
    const fastHandler = vi.fn()
    registry.register({ id: 'fast-handler', channel: 'session:end', handler: fastHandler, priority: 1 })

    await expect(registry.dispatch(makeEvent('session:end'))).resolves.toBeUndefined()
    expect(fastHandler).toHaveBeenCalledTimes(1)
  })

  it('unregister cleans circuit state', async () => {
    const registry = new HookRegistry({ windowMs: 10000, maxFailures: 2, timeoutMs: 10 })

    const handler = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })
    registry.register({ id: 'cleanup-handler', channel: 'task:error', handler, priority: 1 })

    for (let i = 0; i < 2; i++) {
      await expect(registry.dispatch(makeEvent('task:error'))).rejects.toThrow()
    }

    registry.unregister('cleanup-handler')

    const handler2 = vi.fn()
    registry.register({ id: 'new-handler', channel: 'task:error', handler: handler2, priority: 1 })
    await registry.dispatch(makeEvent('task:error'))
    expect(handler2).toHaveBeenCalledTimes(1)
  })
})

describe('HookRegistry priority dispatch', () => {
  it('calls handlers in priority order', async () => {
    const order: number[] = []
    const registry = new HookRegistry({ timeoutMs: 500 })

    registry.register({
      id: 'p3',
      channel: 'session:start',
      handler: async () => {
        order.push(3)
      },
      priority: 3,
    })
    registry.register({
      id: 'p1',
      channel: 'session:start',
      handler: async () => {
        order.push(1)
      },
      priority: 1,
    })
    registry.register({
      id: 'p2',
      channel: 'session:start',
      handler: async () => {
        order.push(2)
      },
      priority: 2,
    })

    await registry.dispatch(makeEvent('session:start'))
    expect(order).toEqual([1, 2, 3])
  })
})

describe('HookRegistry list', () => {
  it('returns registered handler IDs', () => {
    const registry = new HookRegistry()
    registry.register({ id: 'h1', channel: 'session:start', handler: async () => {}, priority: 0 })
    registry.register({ id: 'h2', channel: 'task:error', handler: async () => {}, priority: 0 })
    registry.register({ id: 'h3', channel: 'session:start', handler: async () => {}, priority: 0 })

    const ids = registry.list()
    expect(ids).toContain('h1')
    expect(ids).toContain('h2')
    expect(ids).toContain('h3')
    expect(ids).toHaveLength(3)
  })
})

describe('HookBus + HookRegistry interop', () => {
  it('can coexist without conflict (separate handler sets)', async () => {
    const bus = new HookBus()
    const registry = new HookRegistry()
    const busHandler = vi.fn()
    const regHandler = vi.fn()

    bus.on('task:post-complete', busHandler)
    registry.register({ id: 'reg-handler', channel: 'task:post-complete', handler: regHandler, priority: 1 })

    await bus.emit(makeEvent('task:post-complete'))
    expect(busHandler).toHaveBeenCalledTimes(1)
    expect(regHandler).not.toHaveBeenCalled()

    await registry.dispatch(makeEvent('task:post-complete'))
    expect(regHandler).toHaveBeenCalledTimes(1)
  })
})
