import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProcessCleanup, registerCleanupOnSignals, type CleanupEntry } from '../core/mcp/process-cleanup.js'

describe('ProcessCleanup — gerenciamento de limpeza de processos MCP', () => {
  let cleanup: ProcessCleanup

  beforeEach(() => {
    cleanup = new ProcessCleanup()
  })

  it('registra entry e limpa no shutdown', async () => {
    const spy = vi.fn()
    cleanup.register({ name: 'test-server', pid: 12345, onCleanup: spy })
    await cleanup.shutdown()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('idempotente — shutdown multiplo seguro', async () => {
    const spy = vi.fn()
    cleanup.register({ name: 'test', pid: 999, onCleanup: spy })
    await cleanup.shutdown()
    await cleanup.shutdown()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('limpa todas as entradas registradas', async () => {
    const spy1 = vi.fn()
    const spy2 = vi.fn()
    cleanup.register({ name: 'srv1', pid: 1, onCleanup: spy1 })
    cleanup.register({ name: 'srv2', pid: 2, onCleanup: spy2 })
    await cleanup.shutdown()
    expect(spy1).toHaveBeenCalledTimes(1)
    expect(spy2).toHaveBeenCalledTimes(1)
  })

  it('sem registros, shutdown nao falha', async () => {
    await expect(cleanup.shutdown()).resolves.toBeUndefined()
  })

  it('erro em um cleanup nao quebra os outros', async () => {
    const good = vi.fn()
    cleanup.register({ name: 'good', pid: 1, onCleanup: good })
    cleanup.register({
      name: 'bad',
      pid: 2,
      onCleanup: () => {
        throw new Error('fail')
      },
    })
    await cleanup.shutdown()
    expect(good).toHaveBeenCalledTimes(1)
  })
})

describe('registerCleanupOnSignals — node_wire_af3ca2ac0779 (wire process-cleanup to a real signal path)', () => {
  // AC1: GIVEN a registered cleanup WHEN the process receives SIGINT THEN shutdown() runs and registered entries clean up
  it('shuts down the cleanup registry when SIGINT fires', async () => {
    const cleanup = new ProcessCleanup()
    const spy = vi.fn()
    cleanup.register({ name: 'child', pid: 1, onCleanup: spy })
    const unregister = registerCleanupOnSignals(cleanup)

    process.emit('SIGINT')
    await new Promise((resolve) => setImmediate(resolve))

    expect(spy).toHaveBeenCalledTimes(1)
    unregister()
  })

  // AC2: GIVEN unregister() was called WHEN a signal fires afterwards THEN shutdown() no longer runs
  it('stops listening once unregister() is called', async () => {
    const cleanup = new ProcessCleanup()
    const spy = vi.fn()
    cleanup.register({ name: 'child', pid: 1, onCleanup: spy })
    const unregister = registerCleanupOnSignals(cleanup)
    unregister()

    process.emit('SIGTERM')
    await new Promise((resolve) => setImmediate(resolve))

    expect(spy).not.toHaveBeenCalled()
  })

  // AC3: GIVEN registerCleanupOnSignals runs WHEN it returns THEN it adds exactly one listener per signal (no leak on repeated calls)
  it('adds exactly one listener per signal and removes it on unregister', () => {
    const before = process.listenerCount('SIGINT')
    const cleanup = new ProcessCleanup()
    const unregister = registerCleanupOnSignals(cleanup, ['SIGINT'])
    expect(process.listenerCount('SIGINT')).toBe(before + 1)
    unregister()
    expect(process.listenerCount('SIGINT')).toBe(before)
  })
})
