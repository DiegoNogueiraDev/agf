/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { BroadcastQueue } from '../utils/broadcast-queue.js'
import type { GraphEventBus } from './event-bus.js'
import type { GraphEvent } from './event-types.js'

/**
 * Fans out every event on a GraphEventBus to N independent subscribers.
 * WHY: GraphEventBus is a single process-wide emitter; callers that need
 * per-connection lifecycles (e.g. one SSE stream per open browser tab) can
 * subscribe/unsubscribe on the returned queue without touching the bus itself.
 */
export function createEventBroadcast(bus: GraphEventBus): BroadcastQueue<GraphEvent> {
  const queue = new BroadcastQueue<GraphEvent>()
  bus.on('*', (event) => queue.publish(event))
  return queue
}
