import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProcessCleanup, type CleanupEntry } from '../core/mcp/process-cleanup.js'

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
