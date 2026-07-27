/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-5.T02 — Performance tracker.
 * Pure: aggregates per-agent task records (harnessDelta, acPassed, cycleMs)
 * and produces the stats slice used by sona-router (E5.T05) for kNN routing.
 *
 * Storage is opaque to this module — caller (finish_task hook) appends
 * PerfRecord[]; the aggregator returns AgentStats keyed by agentId.
 */

export interface PerfRecord {
  agentId: string
  nodeId: string
  harnessDelta: number
  acPassed: boolean
  cycleTimeMs: number
  ts: number
}

export interface AgentStats {
  agentId: string
  taskCount: number
  meanHarnessDelta: number
  acPassRate: number
  meanCycleTimeMs: number
  p95CycleTimeMs: number
  lastSeenTs: number
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

function aggregate(records: PerfRecord[]): Omit<AgentStats, 'agentId'> {
  if (records.length === 0) {
    return {
      taskCount: 0,
      meanHarnessDelta: 0,
      acPassRate: 0,
      meanCycleTimeMs: 0,
      p95CycleTimeMs: 0,
      lastSeenTs: 0,
    }
  }
  let sumDelta = 0
  let acHits = 0
  let sumCycle = 0
  let lastSeen = 0
  const cycles: number[] = []
  for (const rVar of records) {
    sumDelta += rVar.harnessDelta
    if (rVar.acPassed) acHits++
    sumCycle += rVar.cycleTimeMs
    cycles.push(rVar.cycleTimeMs)
    if (rVar.ts > lastSeen) lastSeen = rVar.ts
  }
  cycles.sort((a, b) => a - b)
  return {
    taskCount: records.length,
    meanHarnessDelta: sumDelta / records.length,
    acPassRate: acHits / records.length,
    meanCycleTimeMs: sumCycle / records.length,
    p95CycleTimeMs: percentile(cycles, 95),
    lastSeenTs: lastSeen,
  }
}

/**
 * Group records by agentId and produce sorted AgentStats[]. Sorting:
 * highest meanHarnessDelta first (the agents that grow harness fastest
 * surface for routing). Caller handles persistence and trim policy.
 */
export function aggregatePerformance(records: PerfRecord[]): AgentStats[] {
  const byAgent = new Map<string, PerfRecord[]>()
  for (const rVar of records) {
    const arr = byAgent.get(rVar.agentId)
    if (arr) arr.push(rVar)
    else byAgent.set(rVar.agentId, [rVar])
  }
  const out: AgentStats[] = []
  for (const [agentId, recs] of byAgent) {
    out.push({ agentId, ...aggregate(recs) })
  }
  return out.sort((a, b) => b.meanHarnessDelta - a.meanHarnessDelta)
}

/** Filter records by agent (no-op for unknown agents — caller decides). */
export function recordsForAgent(records: PerfRecord[], agentId: string): PerfRecord[] {
  return records.filter((r) => r.agentId === agentId)
}

/** Trim: keep the most recent N records per agent. */
export function trimToRecent(records: PerfRecord[], maxPerAgent: number): PerfRecord[] {
  const byAgent = new Map<string, PerfRecord[]>()
  for (const rVar of records) {
    const arr = byAgent.get(rVar.agentId)
    if (arr) arr.push(rVar)
    else byAgent.set(rVar.agentId, [rVar])
  }
  const out: PerfRecord[] = []
  for (const [, recs] of byAgent) {
    const sorted = [...recs].sort((a, b) => b.ts - a.ts)
    out.push(...sorted.slice(0, maxPerAgent))
  }
  return out.sort((a, b) => a.ts - b.ts)
}
