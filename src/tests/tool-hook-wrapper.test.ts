/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { withToolHooks } from '../core/hooks/tool-hook-wrapper.js'
import { HookBus } from '../core/hooks/hook-bus.js'
import { GraphEventBus } from '../core/events/event-bus.js'

describe('withToolHooks', () => {
  let hookBus: HookBus

  beforeEach(() => {
    hookBus = new HookBus(new GraphEventBus())
  })

  it('calls handler and emits tool:pre-call and tool:post-call', async () => {
    const handler = vi.fn().mockResolvedValue({ result: 'ok' })
    const wrapped = withToolHooks('test-tool', handler, hookBus)

    const preCallHandler = vi.fn()
    const postCallHandler = vi.fn()
    hookBus.on('tool:pre-call', preCallHandler)
    hookBus.on('tool:post-call', postCallHandler)

    const output = await wrapped({ arg1: 'hello' })

    expect(output).toEqual({ result: 'ok' })
    expect(handler).toHaveBeenCalledWith({ arg1: 'hello' })
    expect(preCallHandler).toHaveBeenCalledTimes(1)

    const preEvent = preCallHandler.mock.calls[0][0]
    expect(preEvent.channel).toBe('tool:pre-call')
    expect(preEvent.payload.toolName).toBe('test-tool')
    expect(preEvent.payload.args).toEqual({ arg1: 'hello' })

    expect(postCallHandler).toHaveBeenCalledTimes(1)
    const postEvent = postCallHandler.mock.calls[0][0]
    expect(postEvent.channel).toBe('tool:post-call')
    expect(postEvent.payload.toolName).toBe('test-tool')
    expect(postEvent.payload.durationMs).toBeGreaterThanOrEqual(0)
    expect(postEvent.payload.error).toBeUndefined()
  })

  it('re-throws handler error and includes error in post-call', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('tool failed'))
    const wrapped = withToolHooks('error-tool', handler, hookBus)

    const postCallHandler = vi.fn()
    hookBus.on('tool:post-call', postCallHandler)

    await expect(wrapped({})).rejects.toThrow('tool failed')

    expect(postCallHandler).toHaveBeenCalledTimes(1)
    const postEvent = postCallHandler.mock.calls[0][0]
    expect(postEvent.payload.error).toBe('tool failed')
    expect(postEvent.payload.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('works with handler returning undefined', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    const wrapped = withToolHooks('void-tool', handler, hookBus)

    const output = await wrapped({})
    expect(output).toBeUndefined()
  })

  it('emits correct toolName in both events', async () => {
    const handler = vi.fn().mockResolvedValue({})
    const wrapped = withToolHooks('my-custom-tool', handler, hookBus)

    const events: string[] = []
    hookBus.on('tool:pre-call', (e) => events.push(`pre:${e.payload.toolName}`))
    hookBus.on('tool:post-call', (e) => events.push(`post:${e.payload.toolName}`))

    await wrapped({})

    expect(events).toEqual(['pre:my-custom-tool', 'post:my-custom-tool'])
  })

  it('post-call durationMs reflects actual handler execution time', async () => {
    const handler = vi.fn().mockImplementation(() => new Promise((r) => setTimeout(() => r({}), 50)))
    const wrapped = withToolHooks('slow-tool', handler, hookBus)

    const postCallHandler = vi.fn()
    hookBus.on('tool:post-call', postCallHandler)

    await wrapped({})

    const postEvent = postCallHandler.mock.calls[0][0]
    expect(postEvent.payload.durationMs).toBeGreaterThanOrEqual(40)
    expect(postEvent.payload.durationMs).toBeLessThan(200)
  })
})
