/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-unified-observability — Task 2.2: Browser-harness → Event Store bridge.
 *
 * Subscribes to the GraphEventBus for browser-harness event kinds and writes
 * a row to the `events` table via EventWriter (best-effort, buffered).
 * Does NOT touch the SSE handler — SSE remains the source-of-truth for live
 * updates (AC2).
 */

import type { GraphEventBus } from '../events/event-bus.js'
import type { EventWriter } from './writer.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'browser-harness-bridge.ts' })

/**
 * Event kinds emitted by the browser-harness subsystem.
 * These must stay in sync with the BROWSER_TEST_EVENTS set in
 * src/api/routes/browser-tests.ts.
 */
const BROWSER_HARNESS_EVENT_KINDS = new Set([
  'test.started',
  'test.step',
  'test.evidence',
  'test.broken',
  'test.heal_proposed',
  'test.passed',
  'test.failed',
])

/**
 * Attach the Event Store bridge to the GraphEventBus.
 *
 * Every browser-harness event emitted on `bus` will also be persisted
 * to the `events` table via `writer` with:
 *   - `kind`           = event.type  (e.g. "test.step")
 *   - `subjectRef.kind` = "browser-harness"  (the source)
 *   - `subjectRef.id`  = runId from event payload (falls back to "unknown")
 *   - `sessionId`      = runId from event payload
 *
 * Returns a cleanup function that removes the listener (useful for tests).
 */
export function attachBrowserHarnessEventStore(bus: GraphEventBus, writer: EventWriter): () => void {
  const handler = (event: { type: string; payload: Record<string, unknown> }): void => {
    if (!BROWSER_HARNESS_EVENT_KINDS.has(event.type)) return

    const runId = (event.payload?.['runId'] as string | undefined) ?? 'unknown'

    writer.emit({
      kind: event.type,
      subjectRef: { kind: 'browser-harness', id: runId },
      sessionId: runId,
      timestamp: new Date().toISOString(),
      payload: event.payload,
    })

    log.debug('browser-harness event written to event store', {
      kind: event.type,
      runId,
    })
  }

  bus.on('*' as never, handler as never)

  return () => {
    bus.off('*' as never, handler as never)
  }
}
