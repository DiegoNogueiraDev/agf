/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { useEffect, useRef, useCallback } from 'react'

type SSEEvent =
  | 'node:created'
  | 'node:updated'
  | 'node:deleted'
  | 'edge:created'
  | 'edge:deleted'
  | 'import:completed'
  | 'translation:job_created'
  | 'translation:analyzed'
  | 'translation:finalized'
  | 'translation:error'

const INITIAL_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 30000

/** useSSE — auto-generated description placeholder. */
export function useSSE(onEvent: (event: SSEEvent, data: unknown) => void): void {
  const callbackRef = useRef(onEvent)
  callbackRef.current = onEvent

  const esRef = useRef<EventSource | null>(null)
  const backoffRef = useRef(INITIAL_BACKOFF_MS)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const disposedRef = useRef(false)

  const connect = useCallback(() => {
    if (disposedRef.current) return
    // Close any existing connection before creating a new one
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }
    if (reconnectTimeoutRef.current !== null) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    const es = new EventSource('/api/v1/events')
    esRef.current = es

    const handler = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)
        callbackRef.current(e.type as SSEEvent, data)
      } catch {
        // ignore parse errors
      }
    }

    const events: SSEEvent[] = [
      'node:created',
      'node:updated',
      'node:deleted',
      'edge:created',
      'edge:deleted',
      'import:completed',
      'translation:job_created',
      'translation:analyzed',
      'translation:finalized',
      'translation:error',
    ]

    for (const evt of events) {
      es.addEventListener(evt, handler)
    }

    // Also handle generic "message" events
    es.onmessage = handler

    es.onopen = () => {
      // Reset backoff on successful connection
      backoffRef.current = INITIAL_BACKOFF_MS
    }

    es.onerror = () => {
      es.close()
      esRef.current = null

      // Exponential backoff: start at 1s, double each retry, max 30s
      const delay = backoffRef.current
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS)
      if (!disposedRef.current) {
        reconnectTimeoutRef.current = window.setTimeout(() => {
          reconnectTimeoutRef.current = null
          connect()
        }, delay)
      }
    }
  }, [])

  useEffect(() => {
    disposedRef.current = false
    connect()
    return () => {
      disposedRef.current = true
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }
    }
  }, [connect])
}
