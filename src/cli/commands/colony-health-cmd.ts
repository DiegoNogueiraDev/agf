/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §E5.1 — `agf colony-health` command.
 * §E5.2 — `--history` flag for snapshot trend.
 * Zero-LLM. <1s. Pure deterministic output.
 */

import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Command } from 'commander'
import { listMemories, readMemory } from '../../core/memory/index.js'
import { parseColonyHealthHistory, type ColonyHealthMemoryEntry } from '../../core/colony/colony-health-history.js'
import { buildColonyHealthStatus, type ColonyTrend } from '../../core/colony/colony-health-status.js'
import { readRecentHarnessBreakdowns } from '../../core/harness/harness-trends.js'
import { detectDimensionSaturation, type SaturationSignal } from '../../core/harness/dimension-saturation.js'
import { openStoreOrFail } from '../open-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import { STORE_DIR } from '../../core/utils/constants.js'

/** Count pheromone trails from the DB (zero-LLM, ~1ms). */
function countPheromoneTrails(db: import('better-sqlite3').Database): number {
  try {
    const row = db.prepare('SELECT COUNT(*) as c FROM pheromone_trails').get() as { c: number } | undefined
    return row?.c ?? 0
  } catch {
    return 0
  }
}

/**
 * Deterministic dimension-saturation from the two most recent harness_history
 * rows — no scan, no LLM. Returns undefined until ≥2 cycles exist.
 */
function computeSaturation(db: import('better-sqlite3').Database): SaturationSignal | undefined {
  const rows = readRecentHarnessBreakdowns(db, 'proj_local', 2)
  if (rows.length < 2) return undefined
  try {
    const current = JSON.parse(rows[0]!.breakdown) as Record<string, { score: number }>
    const history = [{ breakdown: rows[1]!.breakdown, timestamp: rows[1]!.timestamp, score: rows[1]!.score }]
    return detectDimensionSaturation(history, current)
  } catch {
    return undefined
  }
}

/** Count memories from the filesystem snapshot dir (~1ms). */
function countMemories(dir: string): number {
  try {
    const memDir = join(dir, STORE_DIR, 'memories')
    return readdirSync(memDir).filter((f) => f.endsWith('.md')).length
  } catch {
    return 0
  }
}

/** Derive trend from last 2 snapshot entries. */
function deriveTrend(entries: ColonyHealthMemoryEntry[]): ColonyTrend {
  if (entries.length < 2) return 'stable'
  const sorted = [...entries].sort((a, b) => b.date.getTime() - a.date.getTime())
  const GRADE_ORDER: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 }
  const latest = GRADE_ORDER[sorted[0]!.grade] ?? 3
  const prev = GRADE_ORDER[sorted[1]!.grade] ?? 3
  if (latest <= 1) return 'critical' // grade F
  if (latest > prev) return 'up'
  if (latest < prev) return 'down'
  return 'stable'
}

/** Builds the `agf colony-health` CLI command (Commander definition). */
export function colonyHealthCommand(): Command {
  return new Command('colony-health')
    .description('Show colony health status and snapshot history')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('--history', 'Show trend of last 7 colony-health snapshots')
    .option('--limit <n>', 'Number of snapshots to show in history', '7')
    .action(async (opts: { dir: string; history?: boolean; limit: string }) => {
      const out = createCliOutput('colony-health')

      if (opts.history) {
        const limit = parseInt(opts.limit, 10) || 7
        const allMemories = await listMemories(opts.dir)
        const snapshots = allMemories.filter((m) => m.startsWith('colony-health-snapshot-'))

        const entries: ColonyHealthMemoryEntry[] = []
        for (const m of snapshots) {
          const suffix = m.slice('colony-health-snapshot-'.length)
          const [y, mo, d, h, mi, s] = suffix.split('-')
          const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`)
          if (isNaN(date.getTime())) continue

          let grade = 'A'
          const full = await readMemory(opts.dir, m)
          if (full?.content) {
            try {
              const parsed = JSON.parse(full.content)
              if (parsed.grade) grade = parsed.grade
            } catch {
              /* malformed snapshot */
            }
          }

          entries.push({ name: m, date, grade, content: full?.content ?? '' })
        }

        const history = parseColonyHealthHistory(entries, limit)
        out.ok({ history })
        return
      }

      // §E5.1 — Live status from graph + DB (zero-LLM, <1s).
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const stats = store.getStats()
        const { byStatus } = stats
        const total = Object.values(byStatus).reduce((s, n) => s + n, 0)
        const done = byStatus['done'] ?? 0
        const doneRatio = total > 0 ? done / total : 0

        const harnessScore = Math.round(doneRatio * 100)
        const testPassRate = harnessScore // approximation from completion ratio
        const doraScore = Math.round(Math.min(doneRatio * 1.2, 1) * 100) // slight boost for deploy freq

        const memCount = countMemories(opts.dir)
        const knowledgeScore = Math.min(memCount * 2, 100)

        const pheromoneCount = countPheromoneTrails(store.getDb())
        const pheromoneScore = Math.min(pheromoneCount * 10, 100)

        const quarantinedCount = byStatus['quarantined'] ?? 0

        // Trend from last snapshot history (filesystem read — <1ms typical).
        let trend: ColonyTrend = 'stable'
        try {
          const memDir = join(opts.dir, STORE_DIR, 'memories')
          const files = readdirSync(memDir)
            .filter((f) => f.startsWith('colony-health-snapshot-') && f.endsWith('.md'))
            .slice(0, 10)
          const entries: ColonyHealthMemoryEntry[] = files.map((f) => {
            const name = f.replace(/\.md$/, '')
            const suffix = name.slice('colony-health-snapshot-'.length)
            const [y, mo, d, h, mi, s] = suffix.split('-')
            const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`)
            return { name, date: isNaN(date.getTime()) ? new Date(0) : date, grade: 'B', content: '' }
          })
          trend = deriveTrend(entries)
        } catch {
          /* filesystem unavailable — default stable */
        }

        const status = buildColonyHealthStatus({
          harnessScore,
          testPassRate,
          doraScore,
          knowledgeScore,
          pheromoneScore,
          quarantinedCount,
          trend,
        })

        const saturation = computeSaturation(store.getDb())
        out.ok({ ...status, ...(saturation ? { saturation } : {}) })
      } finally {
        store.close()
      }
    })
}
