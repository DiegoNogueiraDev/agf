/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * events route — GET /api/v1/events (Server-Sent Events).
 *
 * WHY: the web client (use-sse) opens an EventSource here and refreshes the
 * graph/economy on backend events. Graph mutations made through this same
 * server process (e.g. POST /edges) emit on store.eventBus; createEventBroadcast
 * fans each event out to every open SSE connection (one BroadcastQueue
 * subscriber per browser tab) as a named `event: <type>` frame. Heartbeats
 * (`:ping`) keep the socket alive independently — they don't fire onmessage,
 * so there are no spurious refresh storms between real events.
 */

import { Router } from 'express'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import { GraphEventBus } from '../../core/events/event-bus.js'
import { createEventBroadcast } from '../../core/events/event-broadcast.js'

const HEARTBEAT_MS = 25_000

/** Build the /events SSE router bound to a live store. */
export function createEventsSseRouter(store: SqliteStore): Router {
  const router = Router()
  if (!store.eventBus) store.eventBus = new GraphEventBus()
  const broadcast = createEventBroadcast(store.eventBus)

  router.get('/', (_req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    })
    res.write(': connected\n\n')

    const onEvent = (event: import('../../core/events/event-types.js').GraphEvent): void => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    }
    broadcast.subscribe(onEvent)

    const timer = setInterval(() => {
      res.write(': ping\n\n')
    }, HEARTBEAT_MS)

    res.on('close', () => {
      clearInterval(timer)
      broadcast.unsubscribe(onEvent)
      res.end()
    })
  })

  return router
}
