import { describe, it, expect, beforeEach, vi } from 'vitest'
import { registerHook, dispatchHookWithResult } from '../core/hooks/register-hook.js'
import { HOOK_CHANNELS } from '../core/hooks/hook-types.js'

describe('status:post-change hook', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('status:post-change is in HOOK_CHANNELS', () => {
    expect(HOOK_CHANNELS).toContain('status:post-change')
  })

  it('status:post-change is in HOOK_TAXONOMY', async () => {
    const { HOOK_TAXONOMY } = await import('../core/hooks/hook-types.js')
    expect(HOOK_TAXONOMY).toHaveProperty('post_node_status_change')
  })

  it('fires after status transition succeeds', () => {
    const handler = vi.fn()
    registerHook('status:post-change', handler, { priority: 0, id: 'test-post-status' })

    dispatchHookWithResult('status:post-change', {
      nodeId: 'test-node',
      from: 'backlog',
      to: 'in_progress',
    })

    expect(handler).toHaveBeenCalledOnce()
    const event = handler.mock.calls[0]![0]
    expect(event.payload.nodeId).toBe('test-node')
    expect(event.payload.from).toBe('backlog')
    expect(event.payload.to).toBe('in_progress')
  })

  it('receives correct from/to in payload', () => {
    const payloads: Array<{ from: string; to: string }> = []
    registerHook(
      'status:post-change',
      ((event: { payload: { from: string; to: string } }) => {
        payloads.push({ from: event.payload.from, to: event.payload.to })
      }) as any,
      { priority: 0, id: 'test-post-status-payload' },
    )

    dispatchHookWithResult('status:post-change', {
      nodeId: 'n1',
      from: 'in_progress',
      to: 'done',
    })

    expect(payloads).toEqual([{ from: 'in_progress', to: 'done' }])
  })
})
