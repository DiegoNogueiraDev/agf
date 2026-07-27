/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §E5.2 — Colony health snapshot history utilities.
 * Zero-LLM. Pure functions for naming, pruning, and trend analysis.
 */

export interface ColonyHealthMemoryEntry {
  name: string
  date: Date
  grade: string
  content: string
}

export interface ColonyHealthHistoryItem {
  name: string
  date: Date
  grade: string
  trend: 'improving' | 'stable' | 'declining'
  content: string
}

export interface PruneResult {
  pruned: string[]
  kept: string[]
}

const GRADE_ORDER: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 }

export function buildColonyHealthMemoryName(date: Date): string {
  const d = date.toISOString().slice(0, 10)
  const t = date.toISOString().slice(11, 19).replace(/:/g, '-')
  return `colony-health-snapshot-${d}-${t}`
}

export function pruneColonyHealthSnapshots(entries: ColonyHealthMemoryEntry[], retentionDays: number): PruneResult {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - retentionDays)

  const pruned: string[] = []
  const kept: string[] = []

  for (const entry of entries) {
    if (entry.date < cutoff) {
      pruned.push(entry.name)
    } else {
      kept.push(entry.name)
    }
  }

  return { pruned, kept }
}

export function parseColonyHealthHistory(entries: ColonyHealthMemoryEntry[], limit: number): ColonyHealthHistoryItem[] {
  const sorted = [...entries].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit)

  return sorted.map((entry, i) => {
    const prev = sorted[i + 1]
    let trend: 'improving' | 'stable' | 'declining' = 'stable'

    if (prev) {
      const currScore = GRADE_ORDER[entry.grade] ?? 3
      const prevScore = GRADE_ORDER[prev.grade] ?? 3
      if (currScore > prevScore) trend = 'improving'
      else if (currScore < prevScore) trend = 'declining'
    }

    return { name: entry.name, date: entry.date, grade: entry.grade, trend, content: entry.content }
  })
}
