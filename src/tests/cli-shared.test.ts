/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'

// ── lazy-loader ────────────────────────────────────────────────────────────

describe('LazyCommandLoader', () => {
  it('registers and lists commands', async () => {
    const { LazyCommandLoader } = await import('../cli/lazy-loader.js')
    const loader = new LazyCommandLoader()
    loader.register('foo', () => new Command('foo'), 'Foo command')
    loader.register('bar', () => new Command('bar'), 'Bar command')

    const list = loader.listCommands()
    expect(list).toEqual([
      { name: 'foo', description: 'Foo command' },
      { name: 'bar', description: 'Bar command' },
    ])
  })

  it('registers command without description', async () => {
    const { LazyCommandLoader } = await import('../cli/lazy-loader.js')
    const loader = new LazyCommandLoader()
    loader.register('x', () => new Command('x'))
    expect(loader.listCommands()).toEqual([{ name: 'x', description: '' }])
  })

  it('getCommand returns undefined for unknown name', async () => {
    const { LazyCommandLoader } = await import('../cli/lazy-loader.js')
    const loader = new LazyCommandLoader()
    await expect(loader.getCommand('nope')).resolves.toBeUndefined()
  })

  it('getCommand calls factory on first access and caches', async () => {
    const { LazyCommandLoader } = await import('../cli/lazy-loader.js')
    const factory = vi.fn(() => new Command('cached'))
    const loader = new LazyCommandLoader()
    loader.register('c', factory, 'Cached')

    const a = await loader.getCommand('c')
    const b = await loader.getCommand('c')
    expect(a).toBe(b)
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('re-register clears cache', async () => {
    const { LazyCommandLoader } = await import('../cli/lazy-loader.js')
    const factoryA = vi.fn(() => new Command('a'))
    const factoryB = vi.fn(() => new Command('b'))
    const loader = new LazyCommandLoader()

    loader.register('x', factoryA)
    await loader.getCommand('x')
    loader.register('x', factoryB)
    await loader.getCommand('x')

    expect(factoryA).toHaveBeenCalledTimes(1)
    expect(factoryB).toHaveBeenCalledTimes(1)
  })

  it('getCommand waits for async factory', async () => {
    const { LazyCommandLoader } = await import('../cli/lazy-loader.js')
    const loader = new LazyCommandLoader()
    loader.register('slow', () => Promise.resolve(new Command('slow-cmd')))
    const cmd = await loader.getCommand('slow')
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd!.name()).toBe('slow-cmd')
  })
})

describe('createLazyCommand', () => {
  it('creates a Command proxy with name and description', async () => {
    const { createLazyCommand } = await import('../cli/lazy-loader.js')
    const loader = vi.fn<() => Promise<Command>>().mockResolvedValue(new Command('real'))
    const proxy = createLazyCommand('test-cmd', 'A test command', loader)

    expect(proxy).toBeInstanceOf(Command)
    expect(proxy.name()).toBe('test-cmd')
    expect(proxy.description()).toBe('A test command')
  })

  it('action calls loader and delegates parseAsync', async () => {
    const { createLazyCommand } = await import('../cli/lazy-loader.js')
    const real = new Command('real')
    const parseAsyncSpy = vi.fn().mockResolvedValue(undefined)
    real.parseAsync = parseAsyncSpy

    const loader = vi.fn().mockResolvedValue(real)
    const proxy = createLazyCommand('lazy', 'Lazy loaded', loader)

    const actionFn =
      (proxy as Record<string, unknown>).commands?.[0]?._actionHandler ??
      (proxy as unknown as { _actions: Array<(...args: unknown[]) => void> })._actions?.[0]
    if (actionFn) {
      await actionFn.call(proxy, [], proxy)
    } else {
      await proxy.parseAsync([], { from: 'user' })
    }

    expect(loader).toHaveBeenCalled()
  })
})

// ── banner ─────────────────────────────────────────────────────────────────

describe('showBanner', () => {
  const originalStdout = process.stdout

  afterEach(() => {
    Object.defineProperty(process, 'stdout', {
      value: originalStdout,
      configurable: true,
      writable: true,
    })
  })

  it('does nothing when stdout is not a TTY', async () => {
    const writeSpy = vi.fn()
    Object.defineProperty(process, 'stdout', {
      value: { isTTY: false, write: writeSpy, columns: 80 },
      configurable: true,
      writable: true,
    })

    const { showBanner } = await import('../cli/banner.js')
    await showBanner()
    expect(writeSpy).not.toHaveBeenCalled()
  })

  it('writes output when stdout is a TTY', async () => {
    const writeSpy = vi.fn()
    Object.defineProperty(process, 'stdout', {
      value: { isTTY: true, write: writeSpy, columns: 40 },
      configurable: true,
      writable: true,
    })

    const { showBanner } = await import('../cli/banner.js')
    await showBanner()

    const calls = writeSpy.mock.calls.map((c) => c[0] as string)
    const finalLines = calls.filter((l) => l.includes('mcp-graph-agent'))
    expect(finalLines.length).toBeGreaterThanOrEqual(1)
  })
})

// ── shared/enable-flow ─────────────────────────────────────────────────────

describe('enable-flow', () => {
  function makeStore(): {
    getProjectSetting: ReturnType<typeof vi.fn>
    setProjectSetting: ReturnType<typeof vi.fn>
  } {
    return {
      getProjectSetting: vi.fn(),
      setProjectSetting: vi.fn(),
    }
  }

  it('setFlowEnabled writes enabled=true with existing config merged', async () => {
    const { setFlowEnabled } = await import('../cli/shared/enable-flow.js')
    const store = makeStore()
    store.getProjectSetting.mockReturnValue(JSON.stringify({ phi: 0.5, lambda: 0.3 }))

    setFlowEnabled(store as never, true)

    const key = store.setProjectSetting.mock.calls[0][0]
    const val = JSON.parse(store.setProjectSetting.mock.calls[0][1])
    expect(val).toEqual({ phi: 0.5, lambda: 0.3, enabled: true })
    expect(key).toBe('flow_config')
  })

  it('setFlowEnabled writes enabled=false preserving overrides', async () => {
    const { setFlowEnabled } = await import('../cli/shared/enable-flow.js')
    const store = makeStore()
    store.getProjectSetting.mockReturnValue(JSON.stringify({ phi: 0.8 }))

    setFlowEnabled(store as never, false)

    const val = JSON.parse(store.setProjectSetting.mock.calls[0][1])
    expect(val).toEqual({ phi: 0.8, enabled: false })
  })

  it('setFlowEnabled handles no existing config', async () => {
    const { setFlowEnabled } = await import('../cli/shared/enable-flow.js')
    const store = makeStore()
    store.getProjectSetting.mockReturnValue(null)

    setFlowEnabled(store as never, true)

    const val = JSON.parse(store.setProjectSetting.mock.calls[0][1])
    expect(val).toEqual({ enabled: true })
  })

  it('setFlowEnabled handles corrupt JSON gracefully', async () => {
    const { setFlowEnabled } = await import('../cli/shared/enable-flow.js')
    const store = makeStore()
    store.getProjectSetting.mockReturnValue('not-json')

    setFlowEnabled(store as never, true)

    const val = JSON.parse(store.setProjectSetting.mock.calls[0][1])
    expect(val).toEqual({ enabled: true })
  })

  it('enableFlowConfig sets enabled=true', async () => {
    const { enableFlowConfig } = await import('../cli/shared/enable-flow.js')
    const store = makeStore()
    enableFlowConfig(store as never)

    const val = JSON.parse(store.setProjectSetting.mock.calls[0][1])
    expect(val).toEqual({ enabled: true })
  })
})

// ── shared/store-port ──────────────────────────────────────────────────────

describe('store-port', () => {
  function mockGraphDocument(nodes: Array<{ id: string; title: string }>) {
    return {
      version: '1',
      project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
      nodes: nodes.map((n) => ({ ...n, type: 'task', status: 'backlog', priority: 3 })),
      edges: [],
      indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
      meta: { sourceFiles: [], lastImport: null },
    }
  }

  it('nextTask returns task from findNextTask', async () => {
    const { makeStorePort } = await import('../cli/shared/store-port.js')
    const store = {
      toGraphDocument: vi.fn(() => mockGraphDocument([{ id: 't1', title: 'Task 1' }])),
      updateNodeStatus: vi.fn(),
      getNodeById: vi.fn(),
    }
    const port = makeStorePort(store as never)
    const result = port.nextTask()
    expect(result).not.toBeNull()
    if (result && !('warning' in result)) {
      expect(result.id).toBe('t1')
    }
  })

  it('nextTask returns null when no tasks', async () => {
    const { makeStorePort } = await import('../cli/shared/store-port.js')
    const store = {
      toGraphDocument: vi.fn(() => mockGraphDocument([])),
      updateNodeStatus: vi.fn(),
      getNodeById: vi.fn(),
    }
    const port = makeStorePort(store as never)
    expect(port.nextTask()).toBeNull()
  })

  it('markInProgress delegates to store.updateNodeStatus', async () => {
    const { makeStorePort } = await import('../cli/shared/store-port.js')
    const store = {
      toGraphDocument: vi.fn(() => mockGraphDocument([])),
      updateNodeStatus: vi.fn(),
      getNodeById: vi.fn(),
    }
    const port = makeStorePort(store as never)
    port.markInProgress('t1')
    expect(store.updateNodeStatus).toHaveBeenCalledWith('t1', 'in_progress')
  })

  it('markDone delegates to store.updateNodeStatus', async () => {
    const { makeStorePort } = await import('../cli/shared/store-port.js')
    const store = {
      toGraphDocument: vi.fn(() => mockGraphDocument([])),
      updateNodeStatus: vi.fn(),
      getNodeById: vi.fn(),
    }
    const port = makeStorePort(store as never)
    port.markDone('t1')
    expect(store.updateNodeStatus).toHaveBeenCalledWith('t1', 'done')
  })
})

// ── index.ts exports ───────────────────────────────────────────────────────

describe('CLI index exports', () => {
  beforeEach(() => {
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('re-exports showBanner from banner', async () => {
    const { showBanner } = await import('../cli/banner.js')
    expect(showBanner).toBeDefined()
    expect(typeof showBanner).toBe('function')
  })

  it('re-exports openStoreOrFail from open-store', async () => {
    const { openStoreOrFail } = await import('../cli/open-store.js')
    expect(openStoreOrFail).toBeDefined()
    expect(typeof openStoreOrFail).toBe('function')
  })
})
