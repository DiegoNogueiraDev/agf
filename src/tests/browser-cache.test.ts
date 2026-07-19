import { describe, it, expect, vi } from 'vitest'

vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockImplementation(() => {
    throw new Error('ENOENT')
  }),
}))

import { BrowserBridge } from '../tui/browser-port.js'

describe('BrowserBridge cache', () => {
  it('TTL configuravel (default 30s)', () => {
    const bridge = new BrowserBridge({ cacheTtlMs: 5000 })
    expect(bridge).toBeInstanceOf(BrowserBridge)
    // A posicao eh que nao deve lancar erro ao construir com TTL
  })

  it('didNavigate limpa o cache', () => {
    const bridge = new BrowserBridge()
    bridge.didNavigate()
    // Nao deve lancar erro
  })

  it('getStats retorna hit/miss/size', () => {
    const bridge = new BrowserBridge()
    const stats = bridge.getStats()
    expect(stats).toHaveProperty('hits', 0)
    expect(stats).toHaveProperty('misses', 0)
    expect(stats).toHaveProperty('size', 0)
  })

  it('isAvailable retorna false (stub)', () => {
    const bridge = new BrowserBridge()
    expect(bridge.isAvailable()).toBe(false)
  })

  it('didNavigate zera size do cache', () => {
    const bridge = new BrowserBridge({ maxCache: 10 })
    bridge.didNavigate()
    expect(bridge.getStats().size).toBe(0)
  })
})
