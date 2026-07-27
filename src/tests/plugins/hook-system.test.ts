import { describe, it, expect, vi } from 'vitest'
import { HookSystem, type HookPoint, type HookRegistration } from '../../core/plugins/hook-system.js'

describe('HookSystem', () => {
  it('registerHook() stores a hook and sorts by priority', () => {
    const sys = new HookSystem()
    const low: HookRegistration = {
      pluginName: 'p1',
      hookPoint: 'before:tool_call',
      priority: 10,
      handler: vi.fn(),
    }
    const high: HookRegistration = {
      pluginName: 'p2',
      hookPoint: 'before:tool_call',
      priority: 5,
      handler: vi.fn(),
    }
    sys.registerHook(low)
    sys.registerHook(high)
    const hooks = sys.listHooks()
    expect(hooks).toHaveLength(2)
    expect(hooks[0].priority).toBe(5)
    expect(hooks[1].priority).toBe(10)
  })

  it('executeHooks() calls handlers with a HookContext', async () => {
    const sys = new HookSystem()
    const handler = vi.fn()
    sys.registerHook({
      pluginName: 'p1',
      hookPoint: 'on:node_created',
      priority: 0,
      handler,
    })
    const result = await sys.executeHooks('on:node_created', { id: 'n1' })
    expect(result.hooksCalled).toBe(1)
    expect(result.errors).toEqual([])
    expect(result.aborted).toBe(false)
    expect(handler).toHaveBeenCalledOnce()
    const ctx = handler.mock.calls[0][0]
    expect(ctx.data).toEqual({ id: 'n1' })
    expect(typeof ctx.abort).toBe('function')
  })

  it('executeHooks() allows abort() on before: hooks', async () => {
    const sys = new HookSystem()
    sys.registerHook({
      pluginName: 'gate',
      hookPoint: 'before:phase_transition',
      priority: 0,
      handler: (ctx) => {
        if (ctx.data.phase === 'DEPLOY') ctx.abort('Deploy blocked by gate plugin')
      },
    })
    sys.registerHook({
      pluginName: 'p2',
      hookPoint: 'before:phase_transition',
      priority: 1,
      handler: vi.fn(),
    })
    const result = await sys.executeHooks('before:phase_transition', { phase: 'DEPLOY' })
    expect(result.aborted).toBe(true)
    expect(result.abortReason).toBe('Deploy blocked by gate plugin')
    // second handler should not be called since execution stopped
  })

  it('executeHooks() ignores abort() on non-before hooks', async () => {
    const sys = new HookSystem()
    const handler = vi.fn((ctx: { abort: (r: string) => void }) => ctx.abort('nope'))
    sys.registerHook({
      pluginName: 'p1',
      hookPoint: 'on:node_created',
      priority: 0,
      handler,
    })
    const result = await sys.executeHooks('on:node_created', {})
    expect(result.aborted).toBe(false)
    expect(result.hooksCalled).toBe(1)
  })

  it('executeHooks() collects errors but continues', async () => {
    const sys = new HookSystem()
    sys.registerHook({
      pluginName: 'erratic',
      hookPoint: 'after:tool_call',
      priority: 0,
      handler: () => {
        throw new Error('oops')
      },
    })
    sys.registerHook({
      pluginName: 'ok',
      hookPoint: 'after:tool_call',
      priority: 1,
      handler: vi.fn(),
    })
    const result = await sys.executeHooks('after:tool_call', {})
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toBe('oops')
    expect(result.hooksCalled).toBe(2)
  })

  it('removeHooks() deletes all hooks for a given plugin', () => {
    const sys = new HookSystem()
    sys.registerHook({ pluginName: 'p1', hookPoint: 'on:node_created', priority: 0, handler: vi.fn() })
    sys.registerHook({ pluginName: 'p1', hookPoint: 'before:tool_call', priority: 0, handler: vi.fn() })
    sys.registerHook({ pluginName: 'p2', hookPoint: 'on:node_created', priority: 0, handler: vi.fn() })
    sys.removeHooks('p1')
    const hooks = sys.listHooks()
    expect(hooks).toHaveLength(1)
    expect(hooks[0].pluginName).toBe('p2')
  })

  it('listHooks() returns summary of all registered hooks', () => {
    const sys = new HookSystem()
    sys.registerHook({ pluginName: 'a', hookPoint: 'on:node_updated', priority: 1, handler: vi.fn() })
    sys.registerHook({ pluginName: 'b', hookPoint: 'on:node_updated', priority: 2, handler: vi.fn() })
    const result = sys.listHooks()
    expect(result).toEqual([
      { pluginName: 'a', hookPoint: 'on:node_updated', priority: 1 },
      { pluginName: 'b', hookPoint: 'on:node_updated', priority: 2 },
    ])
  })

  it('executeHooks() handles empty hook point gracefully', async () => {
    const sys = new HookSystem()
    const result = await sys.executeHooks('on:spec_changed', {})
    expect(result.hooksCalled).toBe(0)
    expect(result.errors).toEqual([])
    expect(result.aborted).toBe(false)
  })
})
