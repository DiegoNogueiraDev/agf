/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Surface-level invariants for the dashboard apiClient. Pins the canonical
 * method names + URLs for the two-tab surface (graph, stats, economy) so a
 * refactor that renames or drops one fails here instead of silently breaking a
 * tab at runtime.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiClient } from './api-client.js'

describe('apiClient — surface contract', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exposes the graph/stats/economy/createEdge methods', () => {
    expect(typeof apiClient.getGraph).toBe('function')
    expect(typeof apiClient.getStats).toBe('function')
    expect(typeof apiClient.getEconomy).toBe('function')
    expect(typeof apiClient.createEdge).toBe('function')
  })

  it('POSTs to /api/v1/edges for createEdge', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    await apiClient.createEdge({ from: 'a', to: 'b', relationType: 'depends_on' })
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/edges')
    expect((options as RequestInit).method).toBe('POST')
    expect(JSON.parse((options as RequestInit).body as string)).toMatchObject({ from: 'a', to: 'b' })
  })

  it('calls /api/v1/graph for getGraph', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    await apiClient.getGraph()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/graph')
  })

  it('calls /api/v1/stats for getStats', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    await apiClient.getStats()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/stats')
  })

  it('calls /api/v1/economy for getEconomy', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    await apiClient.getEconomy()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/economy')
  })

  it('throws a structured ApiError for non-OK responses', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'bork', details: { foo: 1 } }),
    } as Response)

    await expect(apiClient.getGraph()).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
    })
  })
})
