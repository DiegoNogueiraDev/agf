/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node_69dab55d3130: promotes the auto-generated smoke test to real
 * behavioral coverage of useSSE. jsdom has no native EventSource, so this
 * installs a minimal fake that records listeners and lets the test drive
 * message/error dispatch deterministically.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSSE } from './use-sse'

class FakeEventSource {
  static instances: FakeEventSource[] = []
  url: string
  listeners = new Map<string, Array<(e: MessageEvent) => void>>()
  onmessage: ((e: MessageEvent) => void) | null = null
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  closed = false

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }

  addEventListener(type: string, handler: (e: MessageEvent) => void): void {
    const list = this.listeners.get(type) ?? []
    list.push(handler)
    this.listeners.set(type, list)
  }

  close(): void {
    this.closed = true
  }

  /** Test helper: dispatch a named SSE event with a JSON-serializable payload. */
  emit(type: string, data: unknown): void {
    const event = { type, data: JSON.stringify(data) } as MessageEvent
    for (const handler of this.listeners.get(type) ?? []) handler(event)
    if (type === 'message') this.onmessage?.(event)
  }

  /** Test helper: dispatch a raw (possibly invalid) payload as a named event. */
  emitRaw(type: string, rawData: string): void {
    const event = { type, data: rawData } as MessageEvent
    for (const handler of this.listeners.get(type) ?? []) handler(event)
  }

  triggerError(): void {
    this.onerror?.()
  }
}

let originalEventSource: typeof EventSource

beforeEach(() => {
  FakeEventSource.instances = []
  originalEventSource = globalThis.EventSource
  globalThis.EventSource = FakeEventSource as unknown as typeof EventSource
})

afterEach(() => {
  globalThis.EventSource = originalEventSource
  vi.useRealTimers()
})

describe('useSSE', () => {
  it('connects to /api/v1/events on mount', () => {
    renderHook(() => useSSE(() => {}))
    expect(FakeEventSource.instances).toHaveLength(1)
    expect(FakeEventSource.instances[0].url).toBe('/api/v1/events')
  })

  it('calls onEvent with the parsed payload when a known SSE event arrives', () => {
    const onEvent = vi.fn()
    renderHook(() => useSSE(onEvent))

    FakeEventSource.instances[0].emit('node:created', { id: 'n1' })

    expect(onEvent).toHaveBeenCalledWith('node:created', { id: 'n1' })
  })

  it('silently ignores an invalid JSON payload without calling onEvent or throwing', () => {
    const onEvent = vi.fn()
    renderHook(() => useSSE(onEvent))

    expect(() => FakeEventSource.instances[0].emitRaw('node:created', 'not valid json')).not.toThrow()
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('reconnects with exponential backoff (1s, then 2s) after onerror', () => {
    vi.useFakeTimers()
    renderHook(() => useSSE(() => {}))

    expect(FakeEventSource.instances).toHaveLength(1)

    FakeEventSource.instances[0].triggerError()
    expect(FakeEventSource.instances[0].closed).toBe(true)
    expect(FakeEventSource.instances).toHaveLength(1) // not reconnected yet

    vi.advanceTimersByTime(1000)
    expect(FakeEventSource.instances).toHaveLength(2) // reconnected after 1s

    FakeEventSource.instances[1].triggerError()
    vi.advanceTimersByTime(1999)
    expect(FakeEventSource.instances).toHaveLength(2) // not yet — backoff doubled to 2s

    vi.advanceTimersByTime(1)
    expect(FakeEventSource.instances).toHaveLength(3) // reconnected after the full 2s
  })

  it('closes the connection and cancels any pending reconnect on unmount', () => {
    vi.useFakeTimers()
    const { unmount } = renderHook(() => useSSE(() => {}))

    FakeEventSource.instances[0].triggerError()
    unmount()

    // Advancing time after unmount must not spawn a new EventSource.
    vi.advanceTimersByTime(30000)
    expect(FakeEventSource.instances).toHaveLength(1)
  })
})
