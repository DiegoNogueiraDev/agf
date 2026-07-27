/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildMemoryHealthReport } from '../core/utils/memory-telemetry.js'
import { MemoryTelemetry } from '../core/utils/memory-telemetry.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('buildMemoryHealthReport', () => {
  it('returns a report with default thresholds', () => {
    const report = buildMemoryHealthReport()
    expect(report.thresholds.warnMb).toBe(600)
    expect(report.thresholds.rejectMb).toBe(800)
    expect(report.heap).toHaveProperty('heapUsedMb')
    expect(report.heap).toHaveProperty('heapTotalMb')
    expect(report.heap).toHaveProperty('level')
    expect(report.agents).toBe(0)
    expect(Array.isArray(report.recommendations)).toBe(true)
  })

  it('accepts custom thresholds', () => {
    const report = buildMemoryHealthReport({ warnThresholdMb: 100, rejectThresholdMb: 200 })
    expect(report.thresholds.warnMb).toBe(100)
    expect(report.thresholds.rejectMb).toBe(200)
  })

  it('accepts custom readHeap to fake memory levels', () => {
    const report = buildMemoryHealthReport({
      warnThresholdMb: 100,
      rejectThresholdMb: 200,
      readHeap: () => 250 * 1024 * 1024,
    })
    expect(report.heap.level).toBe('critical')
    expect(report.recommendations.length).toBeGreaterThan(0)
    expect(report.recommendations[0]).toContain('restart daemon')
  })

  it('produces warning recommendations', () => {
    const report = buildMemoryHealthReport({
      warnThresholdMb: 100,
      rejectThresholdMb: 200,
      readHeap: () => 150 * 1024 * 1024,
    })
    expect(report.heap.level).toBe('warning')
    expect(report.recommendations.length).toBeGreaterThan(0)
    expect(report.recommendations[0]).toContain('monitor closely')
  })

  it('ok level produces no recommendations', () => {
    const report = buildMemoryHealthReport({
      warnThresholdMb: 600,
      rejectThresholdMb: 800,
      readHeap: () => 100 * 1024 * 1024,
    })
    expect(report.heap.level).toBe('ok')
    expect(report.recommendations).toHaveLength(0)
  })

  it('uses custom agentCount', () => {
    const report = buildMemoryHealthReport({ agentCount: 3 })
    expect(report.agents).toBe(3)
  })
})

describe('MemoryTelemetry', () => {
  it('check logs memory info (no throw)', () => {
    const telemetry = new MemoryTelemetry({ readHeap: () => 100 * 1024 * 1024 })
    expect(() => telemetry.check()).not.toThrow()
  })

  it('check emits memory:pressure_warning on ok→warning transition', () => {
    const emit = vi.fn()
    const telemetry = new MemoryTelemetry({
      warnThresholdMb: 100,
      rejectThresholdMb: 200,
      readHeap: () => 150 * 1024 * 1024,
      eventBus: { emit } as never,
    })
    telemetry.check()
    expect(emit).toHaveBeenCalled()
  })

  it('check emits memory:pressure_critical on critical level', () => {
    const emit = vi.fn()
    const telemetry = new MemoryTelemetry({
      warnThresholdMb: 100,
      rejectThresholdMb: 200,
      readHeap: () => 300 * 1024 * 1024,
      eventBus: { emit } as never,
    })
    telemetry.check()
    // When jumping directly to critical, it should emit the critical event
    expect(emit).toHaveBeenCalled()
  })

  it('start returns a cleanup function that stops polling', async () => {
    vi.useFakeTimers()
    const telemetry = new MemoryTelemetry({
      readHeap: () => 100 * 1024 * 1024,
      intervalMs: 1000,
    })
    const cleanup = telemetry.start()
    expect(typeof cleanup).toBe('function')
    cleanup()
    vi.useRealTimers()
  })

  it('uses custom interval', () => {
    const telemetry = new MemoryTelemetry({ intervalMs: 5000 })
    const cleanup = telemetry.start()
    cleanup()
  })
})
