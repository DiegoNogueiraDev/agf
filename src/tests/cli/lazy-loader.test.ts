import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import { getSharedHookBus, _resetSharedHookBus } from '../../core/hooks/shared-hook-bus.js'
import type { HookEvent } from '../../core/hooks/hook-types.js'

async function createMockCommand(name: string) {
  const cmd = new Command(name)
  cmd.description(`Mock ${name} command`)
  cmd.action(() => {})
  return cmd
}

describe('LazyCommandLoader', () => {
  let loader: import('../../cli/lazy-loader.js').LazyCommandLoader
  let LazyCommandLoader: typeof import('../../cli/lazy-loader.js').LazyCommandLoader

  beforeEach(async () => {
    const mod = await import('../../cli/lazy-loader.js')
    LazyCommandLoader = mod.LazyCommandLoader
    loader = new LazyCommandLoader()
  })

  it('listCommands returns all command names without importing', () => {
    loader.register('import', () => createMockCommand('import'))
    loader.register('phase', () => createMockCommand('phase'))
    loader.register('stats', () => createMockCommand('stats'))

    const entries = loader.listCommands()
    const names = entries.map((e) => e.name)
    expect(names).toEqual(['import', 'phase', 'stats'])
  })

  it('getCommand(name) does dynamic import on first call, caches result', async () => {
    const factory = vi.fn().mockImplementation(() => createMockCommand('import'))
    loader.register('import', factory)

    const cmd1 = await loader.getCommand('import')
    expect(cmd1).toBeDefined()
    expect(factory).toHaveBeenCalledTimes(1)

    const cmd2 = await loader.getCommand('import')
    expect(cmd2).toBe(cmd1)
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('unknown command returns undefined without error', async () => {
    const cmd = await loader.getCommand('nonexistent')
    expect(cmd).toBeUndefined()
  })

  it('test with 3+ mock commands verifies import only on demand', async () => {
    const factoryA = vi.fn().mockImplementation(() => createMockCommand('import'))
    const factoryB = vi.fn().mockImplementation(() => createMockCommand('phase'))
    const factoryC = vi.fn().mockImplementation(() => createMockCommand('stats'))

    loader.register('import', factoryA)
    loader.register('phase', factoryB)
    loader.register('stats', factoryC)

    expect(factoryA).not.toHaveBeenCalled()
    expect(factoryB).not.toHaveBeenCalled()
    expect(factoryC).not.toHaveBeenCalled()

    const cmd = await loader.getCommand('phase')
    expect(cmd).toBeDefined()
    expect(factoryA).not.toHaveBeenCalled()
    expect(factoryB).toHaveBeenCalledTimes(1)
    expect(factoryC).not.toHaveBeenCalled()
  })

  it('register with existing name overwrites', async () => {
    const oldFactory = vi.fn().mockImplementation(() => createMockCommand('old'))
    const newFactory = vi.fn().mockImplementation(() => createMockCommand('new'))

    loader.register('cmd', oldFactory)
    loader.register('cmd', newFactory)

    await loader.getCommand('cmd')
    expect(oldFactory).not.toHaveBeenCalled()
    expect(newFactory).toHaveBeenCalledTimes(1)
  })
})

describe('createLazyCommand hook wiring', () => {
  afterEach(() => {
    _resetSharedHookBus()
  })

  it('emits tool:pre-call and tool:post-call on the shared hook bus around execution', async () => {
    _resetSharedHookBus()
    const events: HookEvent[] = []
    getSharedHookBus().on('tool:pre-call', async (e) => {
      events.push(e)
    })
    getSharedHookBus().on('tool:post-call', async (e) => {
      events.push(e)
    })

    const { createLazyCommand } = await import('../../cli/lazy-loader.js')
    const proxy = createLazyCommand('mockhookcmd', 'desc', async () => {
      const cmd = new Command('mockhookcmd')
      cmd.action(() => {})
      return cmd
    })

    await proxy.parseAsync([], { from: 'user' })

    expect(events.map((e) => e.channel)).toEqual(['tool:pre-call', 'tool:post-call'])
    expect(events[0]?.payload['toolName']).toBe('mockhookcmd')
    expect(events[1]?.payload['toolName']).toBe('mockhookcmd')
    expect(typeof events[1]?.payload['durationMs']).toBe('number')
  })
})
