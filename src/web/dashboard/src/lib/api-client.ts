/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * apiClient — the dashboard's HTTP surface against the Express API (/api/v1).
 *
 * Scoped to exactly what the two tabs need: getGraph (Graph tab), getStats
 * (header counts), getEconomy (Economy tab). Each method is a thin typed wrapper
 * over request(), which adds a timeout, JSON headers, and a structured ApiError
 * on non-2xx. Add a method here only when a tab actually consumes a new route.
 */

import type { ColonyData, EconomySnapshot, GraphDocument, GraphEdge, GraphStats } from './types'

const BASE = '/api/v1'
const REQUEST_TIMEOUT_MS = 30_000

class ApiError extends Error {
  status: number
  details?: unknown

  constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  return Promise.race([
    fetch(url, options),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new ApiError(`Request timeout after ${REQUEST_TIMEOUT_MS / 1000}s: ${url}`, 0)),
        REQUEST_TIMEOUT_MS,
      ),
    ),
  ])
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE}${path}`
  const res = await fetchWithTimeout(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })

  if (res.status === 204) return null as T

  const body = await res.json()
  if (!res.ok) {
    throw new ApiError(body.error || `HTTP ${res.status}`, res.status, body.details)
  }
  return body as T
}

export const apiClient = {
  request,

  /** Full project graph (nodes + edges) for the Graph tab. */
  getGraph: () => request<GraphDocument>('/graph'),

  /** Node counts (totalNodes + byStatus + byType) for the header. */
  getStats: () => request<GraphStats>('/stats'),

  /** Colony view (pheromone trails + entropy + health) for the Colony tab. */
  getColony: () => request<ColonyData>('/colony'),

  /** Create a relationship between two nodes (Graph tab edge-create dialog). */
  createEdge: (data: Pick<GraphEdge, 'from' | 'to' | 'relationType'> & { reason?: string }) =>
    request<GraphEdge>('/edges', { method: 'POST', body: JSON.stringify(data) }),

  /** Real token/cost economy snapshot for the Economy tab. */
  getEconomy: () => request<EconomySnapshot>('/economy'),
}
