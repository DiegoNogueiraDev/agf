/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC — Story 5: Trace/correlation ID propagation
 * AsyncLocalStorage store — propagates traceId + spanId across awaits within a request.
 */

import { AsyncLocalStorage } from 'node:async_hooks'

export interface TraceContext {
  traceId: string
  spanId: string
}

const store = new AsyncLocalStorage<TraceContext>()

/** Return the trace context (traceId + spanId) for the current async context, or undefined if none was set. */
export function getTraceContext(): TraceContext | undefined {
  return store.getStore()
}

/** Run `fn` inside an AsyncLocalStorage context carrying the given `traceId` and `spanId`. Propagates across awaits. */
export function runWithTrace<T>(traceId: string, spanId: string, fn: () => T): T {
  return store.run({ traceId, spanId }, fn)
}
