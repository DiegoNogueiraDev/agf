import { describe, it, expect } from 'vitest'
import { getPluginStateColor, PluginHealth } from '../tui/components/PluginHealth.js'

describe('getPluginStateColor', () => {
  it('returns green for healthy', () => {
    expect(getPluginStateColor('healthy')).toBe('green')
  })

  it('returns yellow for degraded', () => {
    expect(getPluginStateColor('degraded')).toBe('yellow')
  })

  it('returns red for failed', () => {
    expect(getPluginStateColor('failed')).toBe('red')
  })

  it('returns blue for starting', () => {
    expect(getPluginStateColor('starting')).toBe('blue')
  })

  it('returns grey for stopped (default branch)', () => {
    expect(getPluginStateColor('stopped')).toBe('grey')
  })

  it('returns a non-empty string for any known state', () => {
    const states = ['healthy', 'degraded', 'failed', 'starting', 'stopped'] as const
    for (const s of states) {
      expect(getPluginStateColor(s).length).toBeGreaterThan(0)
    }
  })
})

describe('PluginHealth', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof PluginHealth).toBe('function')
  })
})
