/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * FakeMetricsStore — in-memory telemetry/metrics for testing.
 * Records flow metrics, token usage, and cost data without SQLite.
 */

export interface FakeMetricEntry {
  id: string
  timestamp: number
  nodeId: string
  phi: number
  lambda: number
  tokensBaseline: number
  tokensActual: number
  tokensSaved: number
  mode: string
}

export class FakeMetricsStore {
  private entries: FakeMetricEntry[] = []
  private nextId = 1

  record(entry: Omit<FakeMetricEntry, 'id'>): FakeMetricEntry {
    const rec: FakeMetricEntry = { id: `met_${this.nextId++}`, ...entry }
    this.entries.push(rec)
    return rec
  }

  query(nodeId?: string, since?: number): FakeMetricEntry[] {
    let results = this.entries
    if (nodeId) results = results.filter((e) => e.nodeId === nodeId)
    if (since !== undefined) results = results.filter((e) => e.timestamp >= since)
    return results
  }

  totalTokensSaved(): number {
    return this.entries.reduce((sum, e) => sum + e.tokensSaved, 0)
  }

  averagePhi(): number {
    if (this.entries.length === 0) return 0
    return this.entries.reduce((sum, e) => sum + e.phi, 0) / this.entries.length
  }

  reset(): void {
    this.entries = []
    this.nextId = 1
  }
}
