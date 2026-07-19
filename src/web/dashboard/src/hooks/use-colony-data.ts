/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * useColonyData (node_a3357cca194d) — espelho de use-graph-data para a tab
 * Colony: carrega /api/v1/colony (contract node_c8b85a2b9c29) e re-busca em
 * eventos SSE com debounce de 2s (<=1 fetch/2s), colapsando rajadas — a
 * mitigação do risk node_2ef219d03cbb (muitas trilhas ⇒ excesso de re-fetch).
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { apiClient } from '@/lib/api-client'
import type { ColonyData } from '@/lib/types'
import { useSSE } from './use-sse'

const SSE_REFETCH_DEBOUNCE_MS = 2000

interface UseColonyDataReturn {
  data: ColonyData | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/** useColonyData — loads the colony view from the API and refetches on debounced SSE events. */
export function useColonyData(): UseColonyDataReturn {
  const [data, setData] = useState<ColonyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      setData(await apiClient.getColony())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load colony')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current)
    }
  }, [refresh])

  // Rajada de eventos ⇒ um único refetch quando a janela fecha (trailing debounce
  // com janela fixa: o primeiro evento agenda; os demais na janela são absorvidos).
  useSSE(
    useCallback(() => {
      if (debounceRef.current !== null) return
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null
        void refresh()
      }, SSE_REFETCH_DEBOUNCE_MS)
    }, [refresh]),
  )

  return { data, loading, error, refresh }
}
