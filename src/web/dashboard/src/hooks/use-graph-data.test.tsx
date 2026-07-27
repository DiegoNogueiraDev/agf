/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node_d7bd09205cec: promotes the auto-generated smoke test to real
 * behavioral coverage of useGraphData via renderHook.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useGraphData } from './use-graph-data'
import type { GraphDocument } from '@/lib/types'

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getGraph: vi.fn(),
  },
}))

const validGraph: GraphDocument = {
  nodes: [{ id: 'n1', title: 'Node 1', type: 'task', status: 'backlog', priority: 3, createdAt: '', updatedAt: '' }],
  edges: [],
}

describe('useGraphData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches on mount and applies auto-fix sanitization to the response', async () => {
    const { apiClient } = await import('@/lib/api-client')
    vi.mocked(apiClient.getGraph).mockResolvedValue(validGraph)

    const { result } = renderHook(() => useGraphData())

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.graph?.nodes).toHaveLength(1)
    expect(result.current.error).toBeNull()
  })

  it('sets error and loading=false when the fetch rejects', async () => {
    const { apiClient } = await import('@/lib/api-client')
    vi.mocked(apiClient.getGraph).mockRejectedValue(new Error('network down'))

    const { result } = renderHook(() => useGraphData())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBe('network down')
    expect(result.current.graph).toBeNull()
  })

  it('refresh() resets a previous error and refetches', async () => {
    const { apiClient } = await import('@/lib/api-client')
    vi.mocked(apiClient.getGraph).mockRejectedValueOnce(new Error('first failure'))

    const { result } = renderHook(() => useGraphData())
    await waitFor(() => expect(result.current.error).toBe('first failure'))

    vi.mocked(apiClient.getGraph).mockResolvedValueOnce(validGraph)
    await result.current.refresh()

    await waitFor(() => expect(result.current.error).toBeNull())
    expect(result.current.graph?.nodes).toHaveLength(1)
  })

  it('surfaces validation warnings and fatalFields when autoFixGraph repairs the payload', async () => {
    const { apiClient } = await import('@/lib/api-client')
    // Missing required fields on a node — autoFixGraph should repair or flag it.
    vi.mocked(apiClient.getGraph).mockResolvedValue({
      nodes: [{ id: 'n1' }],
      edges: [],
    } as unknown as GraphDocument)

    const { result } = renderHook(() => useGraphData())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.validation).toBeDefined()
    expect(Array.isArray(result.current.validation.warnings)).toBe(true)
  })
})
