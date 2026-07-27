/*!
 * SPDX-License-Identifier: MIT
 * Copyright © 2024-2026 decolua and contributors (9router)
 * Copyright © 2026 Diego Lima Nogueira de Paula (TypeScript port and changes)
 *
 * Ported from 9router (https://github.com/decolua/9router), MIT, whose
 * open-sse/rtk module is itself a port of rtk (https://github.com/rtk-ai/rtk),
 * Apache-2.0, © Patrick Szymkowiak. This file stays under its original MIT
 * terms; agent-graph-flow as a whole is Apache-2.0. See THIRD-PARTY-NOTICES.md.
 */
import { DEDUP_LINE_MAX } from '../constants.js'

/** Compress repeated log lines — collapses consecutive duplicate lines into a single `(×N)` entry. */
export function dedupLog(input: string): string {
  const lines = input.split('\n')
  const out: string[] = []
  let prev: string | null = null
  let runCount = 0
  let blankStreak = 0

  const flushRun = () => {
    if (prev !== null && runCount > 1) {
      out.push(`  ... (${runCount - 1} duplicate lines)`)
    }
  }

  for (const line of lines) {
    if (line.trim() === '') {
      if (blankStreak < 1) out.push(line)
      blankStreak += 1
      flushRun()
      prev = null
      runCount = 0
      continue
    }
    blankStreak = 0
    if (line === prev) {
      runCount += 1
      continue
    }
    flushRun()
    out.push(line)
    prev = line
    runCount = 1
    if (out.length >= DEDUP_LINE_MAX) {
      out.push(`... (truncated at ${DEDUP_LINE_MAX} lines)`)
      return out.join('\n')
    }
  }
  flushRun()
  return out.join('\n')
}

dedupLog.filterName = 'dedup-log'
