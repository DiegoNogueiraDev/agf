/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-12.T08 — Heap telemetry + memory_health analyze mode.
 * HeapTelemetry runs a setInterval that samples process.memoryUsage()
 * every TELEMETRY_INTERVAL_MS and emits structured logs. memoryHealth()
 * is the snapshot used by analyze(mode='memory_health').
 */

import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'heap-telemetry' })

const MB = 1024 * 1024

export const TELEMETRY_INTERVAL_MS = 30_000
export const HEAP_HIGH_MB = 500
export const RSS_HIGH_MB = 1024

export interface MemorySnapshot {
  heapMB: number
  externalMB: number
  rssMB: number
  ts: number
}

export interface MemoryHealth extends MemorySnapshot {
  recommendations: string[]
}

export type HeapSampler = () => MemorySnapshot

/** defaultSampler —  */
export function defaultSampler(now: number = Date.now()): MemorySnapshot {
  const mVar = process.memoryUsage()
  return {
    heapMB: mVar.heapUsed / MB,
    externalMB: mVar.external / MB,
    rssMB: mVar.rss / MB,
    ts: now,
  }
}

/** recommendForSnapshot —  */
export function recommendForSnapshot(snapshot: MemorySnapshot): string[] {
  const out: string[] = []
  if (snapshot.heapMB > HEAP_HIGH_MB) {
    out.push('reduzir batch size — heap > 500MB')
  }
  if (snapshot.rssMB > RSS_HIGH_MB) {
    out.push('restart daemon — RSS > 1GB')
  }
  if (snapshot.externalMB > 200) {
    out.push('verificar Buffers/native handles — external > 200MB')
  }
  if (out.length === 0) out.push('memory healthy')
  return out
}

/** memoryHealth —  */
export function memoryHealth(sampler: HeapSampler = defaultSampler): MemoryHealth {
  const snap = sampler()
  return { ...snap, recommendations: recommendForSnapshot(snap) }
}

export type TelemetryEmitter = (snap: MemorySnapshot) => void

export class HeapTelemetry {
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly sampler: HeapSampler = defaultSampler,
    private readonly emit: TelemetryEmitter = () => {},
    private readonly intervalMs: number = TELEMETRY_INTERVAL_MS,
  ) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      try {
        this.emit(this.sampler())
      } catch (err) {
        log.debug('intentional-swallow', {
          error: String(err),
          reason: 'never let a logging error tear down the daemon',
        })
      }
    }, this.intervalMs)
    if (typeof this.timer.unref === 'function') this.timer.unref()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  isRunning(): boolean {
    return this.timer !== null
  }
}
