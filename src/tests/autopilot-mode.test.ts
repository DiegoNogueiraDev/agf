import { describe, it, expect } from 'vitest'
import { resolveAutopilotMode, buildDelegateMessage } from '../cli/shared/autopilot-mode.js'

describe('resolveAutopilotMode', () => {
  it('--delegate flag always wins', () => {
    expect(resolveAutopilotMode({ delegate: true, live: false, isEnvDelegated: false })).toBe('delegate')
  })

  it('--delegate wins even over --live', () => {
    expect(resolveAutopilotMode({ delegate: true, live: true, isEnvDelegated: false })).toBe('delegate')
  })

  it('--live flag returns live when no --delegate', () => {
    expect(resolveAutopilotMode({ delegate: false, live: true, isEnvDelegated: false })).toBe('live')
  })

  it('no flags + env delegated → delegate', () => {
    expect(resolveAutopilotMode({ delegate: false, live: false, isEnvDelegated: true })).toBe('delegate')
  })

  it('no flags + env not delegated → live', () => {
    expect(resolveAutopilotMode({ delegate: false, live: false, isEnvDelegated: false })).toBe('live')
  })
})

describe('buildDelegateMessage', () => {
  it('returns a string', () => {
    const msg = buildDelegateMessage()
    expect(typeof msg).toBe('string')
  })

  it('non-empty when no taskId', () => {
    expect(buildDelegateMessage().length).toBeGreaterThan(0)
  })

  it('includes taskId when provided', () => {
    const msg = buildDelegateMessage('node_abc123')
    expect(msg).toContain('node_abc123')
  })

  it('includes agf submit when taskId given', () => {
    const msg = buildDelegateMessage('node_xyz')
    expect(msg.toLowerCase()).toContain('agf submit')
  })

  it('message differs with and without taskId', () => {
    const withId = buildDelegateMessage('node_1')
    const withoutId = buildDelegateMessage()
    expect(withId).not.toBe(withoutId)
  })
})
