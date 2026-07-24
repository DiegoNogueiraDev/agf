/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { MemoryGuard, type MemoryPressureLevel } from './memory-guard.js'
import type { GraphEventBus } from '../events/event-bus.js'
import { createLogger } from './logger.js'

const log = createLogger({ layer: 'core', source: 'memory-telemetry.ts' })

const MB = 1024 * 1024
const DEFAULT_INTERVAL_MS = 30_000

export interface MemoryHealthReport {
  heap: {
    heapUsedMb: number
    heapTotalMb: number
    externalMb: number
    rssMb: number
    level: MemoryPressureLevel
  }
  thresholds: {
    warnMb: number
    rejectMb: number
  }
  agents: number
  recommendations: string[]
}

interface BuildOptions {
  readHeap?: () => number
  agentCount?: number
  warnThresholdMb?: number
  rejectThresholdMb?: number
}

/** buildMemoryHealthReport —  */
export function buildMemoryHealthReport(opts: BuildOptions = {}): MemoryHealthReport {
  const warnMb = opts.warnThresholdMb ?? 600
  const rejectMb = opts.rejectThresholdMb ?? 800
  const guard = new MemoryGuard({ warnThresholdMb: warnMb, rejectThresholdMb: rejectMb, readHeap: opts.readHeap })
  const snap = guard.snapshot()
  const usage = process.memoryUsage()

  const recommendations: string[] = []
  if (snap.level === 'critical') {
    recommendations.push(
      `Heap at ${snap.heapUsedMb.toFixed(0)}MB exceeds ${rejectMb}MB limit — restart daemon: mcp-graph daemon restart`,
    )
    recommendations.push('Reduce concurrent agents or lower token budgets to reduce memory pressure.')
  } else if (snap.level === 'warning') {
    recommendations.push(`Heap at ${snap.heapUsedMb.toFixed(0)}MB approaching ${rejectMb}MB limit — monitor closely.`)
    recommendations.push('Consider finishing current tasks before starting new heavy operations.')
  }

  return {
    heap: {
      heapUsedMb: snap.heapUsedMb,
      heapTotalMb: usage.heapTotal / MB,
      externalMb: usage.external / MB,
      rssMb: usage.rss / MB,
      level: snap.level,
    },
    thresholds: { warnMb, rejectMb },
    agents: opts.agentCount ?? 0,
    recommendations,
  }
}

interface TelemetryOptions {
  readHeap?: () => number
  eventBus?: GraphEventBus
  intervalMs?: number
  warnThresholdMb?: number
  rejectThresholdMb?: number
}

/**
 * Periodic heap telemetry that logs memory stats and emits
 * memory:pressure_warning / memory:pressure_critical events.
 */
export class MemoryTelemetry {
  private readonly guard: MemoryGuard
  private readonly eventBus?: GraphEventBus
  private readonly intervalMs: number
  private lastLevel: MemoryPressureLevel = 'ok'

  constructor(opts: TelemetryOptions = {}) {
    this.guard = new MemoryGuard({
      warnThresholdMb: opts.warnThresholdMb,
      rejectThresholdMb: opts.rejectThresholdMb,
      readHeap: opts.readHeap,
    })
    this.eventBus = opts.eventBus
    this.intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS
  }

  /** Single check — logs current heap and emits events on threshold crossings. */
  check(): void {
    const snap = this.guard.snapshot()
    const usage = process.memoryUsage()

    log.info('memory:telemetry', {
      heapUsedMb: snap.heapUsedMb.toFixed(1),
      heapTotalMb: (usage.heapTotal / MB).toFixed(1),
      externalMb: (usage.external / MB).toFixed(1),
      rssMb: (usage.rss / MB).toFixed(1),
      level: snap.level,
      ts: new Date().toISOString(),
    })

    if (this.eventBus && snap.level !== this.lastLevel) {
      if (snap.level === 'critical') {
        this.eventBus.emit({ type: 'memory:pressure_critical', heapUsedMb: snap.heapUsedMb } as never)
      } else if (snap.level === 'warning') {
        this.eventBus.emit({ type: 'memory:pressure_warning', heapUsedMb: snap.heapUsedMb } as never)
      }
    }

    this.lastLevel = snap.level
  }

  /** Start periodic polling. Returns a cleanup function to stop it. */
  start(): () => void {
    const timer = setInterval(() => this.check(), this.intervalMs)
    timer.unref?.()
    return () => clearInterval(timer)
  }
}
