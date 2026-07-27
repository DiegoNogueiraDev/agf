import { describe, it, expect, vi, beforeEach } from 'vitest'
import { dispatchHookWithResult, registerHook } from '../core/hooks/register-hook.js'

describe('gate:check hook integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('gate:check channel exists in taxonomy', async () => {
    const { HOOK_CHANNELS } = await import('../core/hooks/hook-types.js')
    expect(HOOK_CHANNELS).toContain('gate:check')
  })

  it('fires gate:check with gap report data', () => {
    const handler = vi.fn()
    registerHook('gate:check', handler, { priority: 0, id: 'test-gate-check' })

    const result = dispatchHookWithResult('gate:check', {
      ready: false,
      gapCount: 3,
      requiredCount: 1,
      nodeId: 'test-node',
    })

    expect(handler).toHaveBeenCalledOnce()
    const event = handler.mock.calls[0]![0]
    expect(event.payload.ready).toBe(false)
    expect(event.payload.gapCount).toBe(3)
    expect(event.payload.requiredCount).toBe(1)
  })

  it('returns allow when no handlers registered', () => {
    const result = dispatchHookWithResult('gate:check', { ready: true })
    expect(result.action).toBe('allow')
  })
})
