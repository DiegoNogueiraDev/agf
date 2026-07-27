import { describe, it, expect } from 'vitest'
import { fnv1aHash, BrowserBridge, BRIDGE_ERROR_PREFIX } from '../tui/browser-port.js'

describe('BRIDGE_ERROR_PREFIX', () => {
  it('is the expected sentinel string', () => {
    expect(BRIDGE_ERROR_PREFIX).toBe('[browser-harness]')
  })
})

describe('fnv1aHash', () => {
  it('returns a string', () => {
    expect(typeof fnv1aHash('hello')).toBe('string')
  })

  it('is deterministic for same input', () => {
    expect(fnv1aHash('test-key')).toBe(fnv1aHash('test-key'))
  })

  it('differs for different inputs', () => {
    expect(fnv1aHash('abc')).not.toBe(fnv1aHash('def'))
  })

  it('handles empty string', () => {
    expect(() => fnv1aHash('')).not.toThrow()
  })
})

describe('BrowserBridge stats', () => {
  it('starts with zero hits and misses', () => {
    const bridge = new BrowserBridge()
    const stats = bridge.getStats()
    expect(stats.hits).toBe(0)
    expect(stats.misses).toBe(0)
    expect(stats.size).toBe(0)
  })

  it('doesNavigate clears cache without throwing', () => {
    const bridge = new BrowserBridge()
    expect(() => bridge.didNavigate()).not.toThrow()
    expect(bridge.getStats().size).toBe(0)
  })
})
