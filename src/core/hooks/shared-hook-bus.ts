/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type Database from 'better-sqlite3'
import { GraphEventBus } from '../events/event-bus.js'
import { HookBus } from './hook-bus.js'
import { registerBuiltinHandlers } from './builtin-handlers.js'
import { installGraphEventBridge } from './graph-event-bridge.js'
import { loadHookConfig } from './config-loader.js'
import { createLogger } from '../utils/logger.js'
import { attachBrowserHarnessEventStore } from '../event-store/browser-harness-bridge.js'
import { EventWriter } from '../event-store/writer.js'
import { SqliteEventBridge } from '../events/sqlite-event-bridge.js'

const log = createLogger({ layer: 'core', source: 'shared-hook-bus.ts' })

let instance: HookBus | null = null
let graphBus: GraphEventBus | null = null
let registered = false

/** getSharedHookBus —  */
export function getSharedHookBus(): HookBus {
  if (!instance) {
    graphBus = new GraphEventBus()
    instance = new HookBus(graphBus)
  }
  if (!registered) {
    registered = true
    registerBuiltinHandlers(instance)

    // graph-event-bridge.ts: opt-in fan-out from GraphEventBus → HookBus
    // channels, configured via the graphEventBridge block of hooks.json.
    // Empty mapping (the common case — no config, or config without this
    // block) is a no-op inside installGraphEventBridge itself.
    try {
      const { graphEventBridge } = loadHookConfig()
      if (Object.keys(graphEventBridge).length > 0 && graphBus) {
        installGraphEventBridge(graphBus, instance, { mapping: graphEventBridge })
      }
    } catch (err) {
      log.debug('hooks:bridge:load-failed', { error: err instanceof Error ? err.message : String(err) })
    }
  }
  return instance
}

/** setSharedHookBus —  */
export function setSharedHookBus(bus: HookBus | null): void {
  instance = bus
  graphBus = null
  registered = false
}

/** Test-only: reset for clean state between tests. */
export function _resetSharedHookBus(): void {
  instance = null
  graphBus = null
  registered = false
}

/** Test-only: the GraphEventBus paired with the current shared HookBus, if any. */
export function _getSharedGraphBus(): GraphEventBus | null {
  return graphBus
}

/**
 * Attach the browser-harness → event-store bridge (browser-harness-bridge.ts)
 * to the shared GraphEventBus, so `test.*` events persist to the `events`
 * table via the given db. Callers own db lifecycle; returns a cleanup that
 * detaches the listener.
 */
export function attachBrowserHarnessBridge(db: Database.Database): () => void {
  getSharedHookBus() // ensures graphBus is initialized
  const writer = new EventWriter(db)
  return attachBrowserHarnessEventStore(graphBus as GraphEventBus, writer)
}

/**
 * Attach a SqliteEventBridge to the shared GraphEventBus, polling `event_queue`
 * for events published by other agent terminals sharing this SQLite db and
 * re-emitting them on the local bus — cross-terminal event propagation.
 *
 * Returns the bridge itself (not just a cleanup) so callers can `.publish()`
 * outbound events explicitly. Auto-forwarding every local `*` event would echo
 * polled-remote events straight back into the queue, so publishing stays opt-in.
 */
export function attachSqliteEventBridge(
  db: Database.Database,
  agentId: string,
  intervalMs?: number,
): SqliteEventBridge {
  getSharedHookBus() // ensures graphBus is initialized
  const bridge = new SqliteEventBridge(db, graphBus as GraphEventBus, agentId)
  bridge.startPolling(intervalMs)
  return bridge
}
