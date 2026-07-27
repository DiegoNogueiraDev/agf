/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * §EPIC-12.T04 — MemoryGuard heap pressure thresholds + critical reject path.
 * Adds guardOrReject() + event emission on level transitions.
 */
export type MemoryPressureLevel = 'ok' | 'warning' | 'critical'

export class MemoryPressureError extends Error {
  constructor(
    public readonly heapMb: number,
    public readonly rejectThresholdMb: number,
  ) {
    super(`memory-guard:critical heapMb=${heapMb.toFixed(1)} >= ${rejectThresholdMb}`)
    this.name = 'MemoryPressureError'
  }
}

export type MemoryEventEmitter = (
  event: 'MEMORY_PRESSURE_WARNING' | 'MEMORY_PRESSURE_CRITICAL',
  payload: { heapMb: number },
) => void

export interface MemoryPressureResult {
  isError: true
  content: Array<{ type: 'text'; text: string }>
}

export interface MemorySnapshot {
  heapUsedMb: number
  warnThresholdMb: number
  rejectThresholdMb: number
  level: MemoryPressureLevel
}

export interface MemoryGuardOptions {
  warnThresholdMb?: number
  rejectThresholdMb?: number
  readHeap?: () => number
  /** §EPIC-12.T04 — emit MEMORY_PRESSURE_WARNING/CRITICAL on level transitions. */
  emitEvent?: MemoryEventEmitter
}

export const HEAVY_TOOLS: ReadonlyArray<string> = [
  'context',
  'analyze',
  'search',
  'export',
  'rag',
  'code_intelligence',
  'query_graph',
  'plan_sprint',
  'metrics',
  'graph_health',
]

export class MemoryGuard {
  private readonly warnThresholdMb: number
  private readonly rejectThresholdMb: number
  private readonly readHeap: () => number
  private readonly emitEvent?: MemoryEventEmitter
  private lastLevel: MemoryPressureLevel = 'ok'

  constructor(options: MemoryGuardOptions = {}) {
    this.warnThresholdMb = options.warnThresholdMb ?? 600
    this.rejectThresholdMb = options.rejectThresholdMb ?? 800
    this.readHeap = options.readHeap ?? (() => process.memoryUsage().heapUsed)
    this.emitEvent = options.emitEvent
  }

  pressureLevel(): MemoryPressureLevel {
    const heapMb = this.readHeap() / (1024 * 1024)
    return this.classify(heapMb)
  }

  private classify(heapMb: number): MemoryPressureLevel {
    if (heapMb >= this.rejectThresholdMb) return 'critical'
    if (heapMb >= this.warnThresholdMb) return 'warning'
    return 'ok'
  }

  /** §EPIC-12.T04 — sample heap and emit event on level upgrade transitions. */
  check(): { status: MemoryPressureLevel; heapMb: number } {
    const heapMb = this.readHeap() / (1024 * 1024)
    const status = this.classify(heapMb)
    if (status !== this.lastLevel) {
      if (status === 'warning' && this.lastLevel === 'ok') {
        this.emitEvent?.('MEMORY_PRESSURE_WARNING', { heapMb })
      } else if (status === 'critical') {
        this.emitEvent?.('MEMORY_PRESSURE_CRITICAL', { heapMb })
      }
      this.lastLevel = status
    }
    return { status, heapMb }
  }

  /** §EPIC-12.T04 — throws MemoryPressureError when status === 'critical'. */
  guardOrReject(): { status: MemoryPressureLevel; heapMb: number } {
    const sample = this.check()
    if (sample.status === 'critical') {
      throw new MemoryPressureError(sample.heapMb, this.rejectThresholdMb)
    }
    return sample
  }

  checkForTool(toolName: string): MemoryPressureResult | null {
    if (!HEAVY_TOOLS.includes(toolName)) return null
    if (this.pressureLevel() !== 'critical') return null

    const heapMb = Math.round(this.readHeap() / (1024 * 1024))
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: `MEMORY_PRESSURE: heap ${heapMb}MB exceeds ${this.rejectThresholdMb}MB limit. Tool "${toolName}" rejected to prevent OOM crash. Restart daemon: mcp-graph daemon restart`,
        },
      ],
    }
  }

  snapshot(): MemorySnapshot {
    const heapMb = this.readHeap() / (1024 * 1024)
    return {
      heapUsedMb: heapMb,
      warnThresholdMb: this.warnThresholdMb,
      rejectThresholdMb: this.rejectThresholdMb,
      level: this.pressureLevel(),
    }
  }
}
