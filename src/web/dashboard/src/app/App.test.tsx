/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node_4f6016391c05: promotes the auto-generated smoke test to real RTL
 * coverage of App's error boundary, SSE-triggered refresh, and chunk-reload
 * guard — the three behaviors owned by App itself (tab content is covered
 * by graph-tab.test.tsx / token-economy-tab.test.tsx).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { App } from './App'

class FakeEventSource {
  static instances: FakeEventSource[] = []
  listeners = new Map<string, Array<(e: MessageEvent) => void>>()
  onmessage: ((e: MessageEvent) => void) | null = null
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor() {
    FakeEventSource.instances.push(this)
  }

  addEventListener(type: string, handler: (e: MessageEvent) => void): void {
    const list = this.listeners.get(type) ?? []
    list.push(handler)
    this.listeners.set(type, list)
  }

  close(): void {}

  emit(type: string): void {
    const event = { type, data: '{}' } as MessageEvent
    for (const handler of this.listeners.get(type) ?? []) handler(event)
  }
}

// Module-level holder so the mocked GraphTab can decide whether to throw and
// with what message, per test, without re-mocking the module each time.
const graphTabBehavior: { throwMessage: string | null } = { throwMessage: null }

vi.mock('@/components/tabs/graph-tab', () => ({
  GraphTab: () => {
    if (graphTabBehavior.throwMessage) throw new Error(graphTabBehavior.throwMessage)
    return null
  },
}))

vi.mock('@/components/tabs/token-economy-tab', () => ({
  TokenEconomyTab: () => null,
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getGraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
    getStats: vi.fn().mockResolvedValue({ totalNodes: 0, byStatus: {} }),
  },
}))

let originalEventSource: typeof EventSource
let reloadSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  FakeEventSource.instances = []
  graphTabBehavior.throwMessage = null
  originalEventSource = globalThis.EventSource
  globalThis.EventSource = FakeEventSource as unknown as typeof EventSource
  sessionStorage.clear()
  reloadSpy = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload: reloadSpy },
  })
})

afterEach(() => {
  globalThis.EventSource = originalEventSource
  vi.clearAllMocks()
})

describe('<App>', () => {
  it('refreshes graph and stats when an SSE event arrives', async () => {
    const { apiClient } = await import('@/lib/api-client')
    render(<App />)
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1))

    const initialGraphCalls = vi.mocked(apiClient.getGraph).mock.calls.length
    const initialStatsCalls = vi.mocked(apiClient.getStats).mock.calls.length

    FakeEventSource.instances[0].emit('node:created')

    await waitFor(() => {
      expect(vi.mocked(apiClient.getGraph).mock.calls.length).toBeGreaterThan(initialGraphCalls)
      expect(vi.mocked(apiClient.getStats).mock.calls.length).toBeGreaterThan(initialStatsCalls)
    })
  })

  it('shows the error UI with a Reload button when the active tab throws', async () => {
    graphTabBehavior.throwMessage = 'Something exploded'
    render(<App />)

    expect(await screen.findByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(screen.getByText('Something exploded')).toBeInTheDocument()
  })

  it('reloads the page exactly once when a chunk-load error is caught (sessionStorage guard)', async () => {
    graphTabBehavior.throwMessage = 'Failed to fetch dynamically imported module'
    render(<App />)

    await waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1))
    expect(sessionStorage.getItem('chunk_retry_attempted')).toBe('1')
  })
})
