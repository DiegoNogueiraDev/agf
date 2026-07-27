/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi } from 'vitest'
import { installGraphEventBridge } from '../core/hooks/graph-event-bridge.js'

describe('graph-event-bridge', () => {
  it('registers subscriptions for mapped events', () => {
    const graphBus = { on: vi.fn(), off: vi.fn() } as unknown as any
    const hookBus = { emit: vi.fn() } as unknown as any
    const disposer = installGraphEventBridge(graphBus, hookBus, {
      mapping: { 'node:created': ['session:start', 'task:pre-execute'] },
    })
    expect(graphBus.on).toHaveBeenCalledTimes(1)
    expect(typeof disposer).toBe('function')
  })

  it('skips empty channel arrays', () => {
    const graphBus = { on: vi.fn() } as unknown as any
    const hookBus = { emit: vi.fn() } as unknown as any
    installGraphEventBridge(graphBus, hookBus, { mapping: { 'node:created': [] } })
    expect(graphBus.on).not.toHaveBeenCalled()
  })

  it('disposer unsubscribes all', () => {
    const graphBus = { on: vi.fn().mockReturnValue(vi.fn()), off: vi.fn() } as unknown as any
    const hookBus = { emit: vi.fn() } as unknown as any
    const disposer = installGraphEventBridge(graphBus, hookBus, {
      mapping: { 'node:created': ['session:start'] },
    })
    disposer()
    expect(graphBus.off).toHaveBeenCalled()
  })

  it('emits to all mapped channels on graph event', () => {
    const handlers: Record<string, (event: any) => void> = {}
    const graphBus = {
      on: vi.fn((name: string, handler: any) => {
        handlers[name] = handler
      }),
      off: vi.fn(),
    } as unknown as any
    const hookBus = { emit: vi.fn() } as unknown as any
    installGraphEventBridge(graphBus, hookBus, {
      mapping: { 'node:created': ['session:start', 'task:pre-execute'] },
    })
    handlers['node:created']({ payload: { id: 'n1' } })
    expect(hookBus.emit).toHaveBeenCalledTimes(2)
    expect(hookBus.emit).toHaveBeenCalledWith(expect.objectContaining({ channel: 'session:start' }))
    expect(hookBus.emit).toHaveBeenCalledWith(expect.objectContaining({ channel: 'task:pre-execute' }))
  })
})
