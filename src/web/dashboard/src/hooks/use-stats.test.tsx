/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useStats } from './use-stats'
import type { GraphStats } from '@/lib/types'

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getStats: vi.fn(),
  },
}))

const stats: GraphStats = {
  totalNodes: 3,
  byStatus: { backlog: 1, in_progress: 0, done: 2, blocked: 0, satisfied: 0, quarantined: 0 },
  byType: {},
}

describe('useStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reflects the returned data once apiClient.getStats resolves', async () => {
    const { apiClient } = await import('@/lib/api-client')
    vi.mocked(apiClient.getStats).mockResolvedValue(stats)

    const { result } = renderHook(() => useStats())

    await waitFor(() => expect(result.current.stats).toEqual(stats))
  })

  it('leaves stats null and does not throw when apiClient.getStats rejects', async () => {
    const { apiClient } = await import('@/lib/api-client')
    vi.mocked(apiClient.getStats).mockRejectedValue(new Error('network down'))

    const { result } = renderHook(() => useStats())

    await waitFor(() => expect(apiClient.getStats).toHaveBeenCalledTimes(1))
    expect(result.current.stats).toBeNull()
  })

  it('refetches and updates stats when refresh() is called again', async () => {
    const { apiClient } = await import('@/lib/api-client')
    const updated: GraphStats = { ...stats, byStatus: { ...stats.byStatus, done: 3 } }
    vi.mocked(apiClient.getStats).mockResolvedValueOnce(stats).mockResolvedValueOnce(updated)

    const { result } = renderHook(() => useStats())
    await waitFor(() => expect(result.current.stats).toEqual(stats))

    await result.current.refresh()

    await waitFor(() => expect(result.current.stats).toEqual(updated))
    expect(apiClient.getStats).toHaveBeenCalledTimes(2)
  })
})
