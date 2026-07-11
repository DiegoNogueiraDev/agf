/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { createLogger } from '../utils/logger.js'
import type { GraphEventBus } from '../events/event-bus.js'
import type { HookChannel, HookEvent, HookHandler } from './hook-types.js'

const log = createLogger({ layer: 'core', source: 'hook-bus.ts' })

/**
 * Typed pub/sub layer for hook events.
 * Composes GraphEventBus (injected) but routes hook channels independently
 * so hook emissions never bleed into the graph event stream.
 */
export class HookBus {
  private readonly handlers = new Map<HookChannel, Set<HookHandler>>()

  constructor(private readonly graphBus: GraphEventBus) {}

  on(channel: HookChannel, handler: HookHandler): void {
    let set = this.handlers.get(channel)
    if (!set) {
      set = new Set()
      this.handlers.set(channel, set)
    }
    set.add(handler)
  }

  off(channel: HookChannel, handler: HookHandler): void {
    this.handlers.get(channel)?.delete(handler)
  }

  async emit(event: HookEvent): Promise<void> {
    const set = this.handlers.get(event.channel)
    if (!set || set.size === 0) return
    for (const handler of set) {
      try {
        await handler(event)
      } catch (err) {
        log.error('Hook handler error', {
          channel: event.channel,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  /**
   * Synchronous fan-out. Runs each handler's synchronous prefix immediately so
   * better-sqlite3 writes commit before the caller proceeds (or closes the DB).
   * Handlers that genuinely await are fire-and-forget for their async tail; any
   * rejection is logged, never unhandled. Use when the caller cannot await
   * (sync interfaces) but persistence must flush before teardown.
   */
  emitSync(event: HookEvent): void {
    const set = this.handlers.get(event.channel)
    if (!set || set.size === 0) return
    for (const handler of set) {
      try {
        const result = handler(event)
        if (result && typeof result.then === 'function') {
          result.catch((err: unknown) =>
            log.error('Hook handler error (async tail)', {
              channel: event.channel,
              error: err instanceof Error ? err.message : String(err),
            }),
          )
        }
      } catch (err) {
        log.error('Hook handler error', {
          channel: event.channel,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  listenerCount(channel: HookChannel): number {
    return this.handlers.get(channel)?.size ?? 0
  }

  /** Expose the underlying GraphEventBus for cross-cutting use */
  get bus(): GraphEventBus {
    return this.graphBus
  }
}
