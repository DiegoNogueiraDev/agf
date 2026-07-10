/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { useState, useCallback, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'
import type { GraphDocument } from '@/lib/types'
import { autoFixGraph } from '@/lib/graph-sanitizer'

export interface GraphValidationState {
  warnings: string[]
  fatalFields: string[]
  repairImpossible: boolean
}

interface UseGraphDataReturn {
  graph: GraphDocument | null
  loading: boolean
  error: string | null
  validation: GraphValidationState
  refresh: () => Promise<void>
}

/** useGraphData — loads graph from API and applies auto-fix sanitization on receipt. */
export function useGraphData(): UseGraphDataReturn {
  const [graph, setGraph] = useState<GraphDocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [validation, setValidation] = useState<GraphValidationState>({
    warnings: [],
    fatalFields: [],
    repairImpossible: false,
  })

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const raw = await apiClient.getGraph()
      const { graph: fixed, issues, fatalFields, repairImpossible } = autoFixGraph(raw)
      setGraph(fixed)
      setValidation({ warnings: issues, fatalFields, repairImpossible })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load graph')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { graph, loading, error, validation, refresh }
}
