/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node_a3357cca194d: useColonyData consome /api/v1/colony (contract
 * node_c8b85a2b9c29) e re-busca em eventos SSE com debounce (<=1 fetch/2s —
 * mitigação do risk node_2ef219d03cbb). Mesmo padrão de use-graph-data.test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useColonyData } from './use-colony-data'
import type { ColonyData } from '@/lib/types'

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getColony: vi.fn(),
  },
}))

let sseCallback: ((event: string, data: unknown) => void) | null = null
vi.mock('./use-sse', () => ({
  useSSE: (cb: (event: string, data: unknown) => void) => {
    sseCallback = cb
  },
}))

const colony: ColonyData = {
  trails: [{ key: 'trail-a', amount: 5, ts: 1 }],
  entropy: { hNorm: 0.8, band: 'healthy' },
}

describe('useColonyData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sseCallback = null
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fetches on mount and exposes { data, loading:false, error:null } (AC1)', async () => {
    const { apiClient } = await import('@/lib/api-client')
    vi.mocked(apiClient.getColony).mockResolvedValue(colony)

    const { result } = renderHook(() => useColonyData())
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data?.trails).toHaveLength(1)
    expect(result.current.error).toBeNull()
  })

  it('exposes error without crashing when the route fails (AC3)', async () => {
    const { apiClient } = await import('@/lib/api-client')
    vi.mocked(apiClient.getColony).mockRejectedValue(new Error('colony down'))

    const { result } = renderHook(() => useColonyData())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBe('colony down')
    expect(result.current.data).toBeNull()
  })

  it('debounces SSE-triggered refetches to <=1 fetch per 2s window (AC2)', async () => {
    const { apiClient } = await import('@/lib/api-client')
    vi.mocked(apiClient.getColony).mockResolvedValue(colony)

    const { result } = renderHook(() => useColonyData())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(apiClient.getColony).toHaveBeenCalledTimes(1)

    vi.useFakeTimers()
    // Rajada de eventos SSE — deve colapsar num único refetch.
    act(() => {
      sseCallback?.('node:updated', {})
      sseCallback?.('node:updated', {})
      sseCallback?.('edge:created', {})
    })
    expect(apiClient.getColony).toHaveBeenCalledTimes(1) // ainda nada — janela aberta

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(apiClient.getColony).toHaveBeenCalledTimes(2) // 1 refetch pela rajada toda
  })
})
