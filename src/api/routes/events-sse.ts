/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * events route — GET /api/v1/events (Server-Sent Events).
 *
 * WHY: the web client (use-sse) opens an EventSource here and refreshes the
 * graph/economy on backend events. This local dashboard has no live mutation
 * stream yet, so the route holds the connection open with comment heartbeats
 * (`:ping`) — these keep the socket alive WITHOUT firing the client's onmessage
 * handler, so there are no spurious refresh storms. Adding a real event bus
 * later = emit named SSE events (e.g. `event: node:updated`) on this stream.
 */

import { Router } from 'express'

const HEARTBEAT_MS = 25_000

/** Build the /events SSE router. */
export function createEventsSseRouter(): Router {
  const router = Router()

  router.get('/', (_req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    })
    res.write(': connected\n\n')

    const timer = setInterval(() => {
      res.write(': ping\n\n')
    }, HEARTBEAT_MS)

    res.on('close', () => {
      clearInterval(timer)
      res.end()
    })
  })

  return router
}
