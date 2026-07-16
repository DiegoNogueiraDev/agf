/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { createLogger } from '../utils/logger.js'
import { HookTimeoutError, HookCircuitOpenError } from './hook-types.js'
import type { HookEvent, HookRegistration } from './hook-types.js'
import type { HookStatsStore } from './hook-stats-store.js'

const log = createLogger({ layer: 'core', source: 'hook-registry.ts' })

interface CircuitState {
  failures: number
  firstFailureAt: number
  disabled: boolean
}

export interface HookRegistryOptions {
  timeoutMs?: number
  windowMs?: number
  maxFailures?: number
  /** When set, every dispatch records per-handler stats (Sprint 5). */
  statsStore?: HookStatsStore
}

export class HookRegistry {
  private readonly registrations = new Map<string, HookRegistration>()
  private readonly circuits = new Map<string, CircuitState>()
  private readonly timeoutMs: number
  private readonly windowMs: number
  private readonly maxFailures: number
  private statsStore: HookStatsStore | undefined

  constructor(opts: HookRegistryOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? 500
    this.windowMs = opts.windowMs ?? 60_000
    this.maxFailures = opts.maxFailures ?? 3
    this.statsStore = opts.statsStore
  }

  /** Late-binding setter for the stats store (server.ts wires this after DB init). */
  attachStatsStore(store: HookStatsStore): void {
    this.statsStore = store
  }

  register(reg: HookRegistration): void {
    this.registrations.set(reg.id, reg)
  }

  unregister(id: string): void {
    this.registrations.delete(id)
    this.circuits.delete(id)
  }

  list(): string[] {
    return [...this.registrations.keys()]
  }

  async dispatch(event: HookEvent): Promise<void> {
    const sorted = [...this.registrations.values()]
      .filter((r) => r.channel === event.channel)
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))

    for (const reg of sorted) {
      await this.callWithGuards(reg, event)
    }
  }

  private async callWithGuards(reg: HookRegistration, event: HookEvent): Promise<void> {
    const circuit = this.getCircuit(reg.id)

    if (circuit.disabled) {
      const elapsed = Date.now() - circuit.firstFailureAt
      if (elapsed < this.windowMs) {
        throw new HookCircuitOpenError(reg.id)
      }
      this.circuits.delete(reg.id)
    }

    const startedAt = Date.now()
    try {
      await Promise.race([
        reg.handler(event),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new HookTimeoutError(reg.id, this.timeoutMs)), this.timeoutMs),
        ),
      ])
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (err instanceof HookTimeoutError) {
        this.recordFailure(reg.id)
        this.statsStore?.record(reg.id, Date.now() - startedAt, message)
        throw err
      }
      log.error('Hook handler error', { id: reg.id, error: message })
      this.statsStore?.record(reg.id, Date.now() - startedAt, message)
      throw err
    }
    this.statsStore?.record(reg.id, Date.now() - startedAt, null)
  }

  private getCircuit(id: string): CircuitState {
    let state = this.circuits.get(id)
    if (!state) {
      state = { failures: 0, firstFailureAt: 0, disabled: false }
      this.circuits.set(id, state)
    }
    return state
  }

  private recordFailure(id: string): void {
    const state = this.getCircuit(id)
    const now = Date.now()

    if (state.failures === 0) {
      state.firstFailureAt = now
    }

    const elapsed = now - state.firstFailureAt
    if (elapsed > this.windowMs) {
      state.failures = 1
      state.firstFailureAt = now
      return
    }

    state.failures += 1

    if (state.failures >= this.maxFailures) {
      state.disabled = true
      log.warn('Hook circuit opened', {
        audit: true,
        handlerId: id,
        failures: state.failures,
        windowMs: this.windowMs,
      })
    }
  }
}
