/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type { GraphEventBus } from '../events/event-bus.js'
import type { GraphEvent, GraphEventType } from '../events/event-types.js'
import type { HookBus } from './hook-bus.js'
import type { HookChannel } from './hook-types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'graph-event-bridge.ts' })

/**
 * Opt-in bridge: subscribe to GraphEventBus typed events and re-emit them
 * onto HookBus channels. Mapping comes from the `graphEventBridge` block of
 * the hooks config file (loaded via config-loader.ts).
 *
 * Default behavior is OFF. Each entry in the map enables one (graph→hook)
 * fan-out. We tag bridge-emitted hook events with payload._fromBridge=true
 * so that any future GraphEventBus subscriber that wants to *re-emit* hook
 * events can skip them and avoid loops.
 */
export interface BridgeOptions {
  /** mapping: GraphEventType name → list of mcp-graph hook channels */
  mapping: Record<string, HookChannel[]>
}

/** installGraphEventBridge —  */
export function installGraphEventBridge(graphBus: GraphEventBus, hookBus: HookBus, options: BridgeOptions): () => void {
  const subscriptions: Array<() => void> = []

  for (const [graphEventName, channels] of Object.entries(options.mapping)) {
    if (channels.length === 0) continue
    const handler = (event: GraphEvent): void => {
      for (const channel of channels) {
        void hookBus.emit({
          channel,
          timestamp: event.timestamp ?? new Date().toISOString(),
          payload: {
            _fromBridge: true,
            graphEventType: graphEventName,
            graphPayload: event.payload as Record<string, unknown>,
          },
        })
      }
    }
    graphBus.on(graphEventName as GraphEventType, handler)
    subscriptions.push(() => graphBus.off(graphEventName as GraphEventType, handler))
  }

  if (subscriptions.length > 0) {
    log.info('hooks:bridge:installed', { entries: subscriptions.length })
  }

  return () => {
    for (const off of subscriptions) off()
  }
}
