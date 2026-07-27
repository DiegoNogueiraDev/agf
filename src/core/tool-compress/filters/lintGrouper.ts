/*!
 * SPDX-License-Identifier: MIT
 * Copyright © 2024-2026 decolua and contributors (9router)
 * Copyright © 2026 Diego Lima Nogueira de Paula (TypeScript port and changes)
 *
 * Ported from 9router (https://github.com/decolua/9router), MIT, whose
 * open-sse/rtk module is itself a port of rtk (https://github.com/rtk-ai/rtk),
 * Apache-2.0, © Patrick Szymkowiak. This file stays under its original MIT
 * terms; agent-graph-flow as a whole is Apache-2.0. See THIRD-PARTY-NOTICES.md.
 *
 * E3b — lint-grouper filter: groups lint/type errors by rule with counts.
 * Collapses repetitive errors into compact summaries.
 * Target: 80-95% reduction on large lint output.
 */
import type { FilterFn } from '../registry.js'

const TSC_ERROR = /^(\S+)\(\d+,\d+\):\s+(error|warning)\s+(TS\d+):\s*(.+)/m
const ESLINT_LINE = /^\s*\d+:\d+\s+(error|warning)\s+(.+?)\s{2,}([\w@/-]+)$/
const RUFF_LINE = /^(\S+):\d+:\d+:\s+([A-Z]\d+)\s+(.+)/

export const lintGrouper: FilterFn = (text: string): string => {
  // Group by rule
  const rules = new Map<string, { severity: string; count: number; locations: string[]; firstMsg: string }>()

  const lines = text.split('\n')
  let totalErrors = 0
  let totalWarnings = 0

  for (const line of lines) {
    // TSC
    const tscMatch = line.match(TSC_ERROR)
    if (tscMatch) {
      const rule = tscMatch[3]
      const sev = tscMatch[2]
      const c = rules.get(rule) ?? { severity: sev, count: 0, locations: [], firstMsg: tscMatch[4] }
      c.count++
      if (c.locations.length < 3) c.locations.push(tscMatch[1])
      if (sev === 'error') {
        totalErrors++
      } else {
        totalWarnings++
      }
      rules.set(rule, c)
      continue
    }

    // ESLint
    const esMatch = line.match(ESLINT_LINE)
    if (esMatch) {
      const rule = esMatch[3]
      const c = rules.get(rule) ?? { severity: esMatch[1], count: 0, locations: [], firstMsg: esMatch[2].trim() }
      c.count++
      if (c.locations.length < 3) {
        const loc = esMatch.input?.match(/^\s*(\d+):(\d+)/)
        if (loc) c.locations.push(`line ${loc[1]}`)
      }
      if (esMatch[1] === 'error') {
        totalErrors++
      } else {
        totalWarnings++
      }
      rules.set(rule, c)
      continue
    }

    // Ruff/Pylint
    const ruffMatch = line.match(RUFF_LINE)
    if (ruffMatch) {
      const rule = ruffMatch[2]
      const c = rules.get(rule) ?? { severity: 'error', count: 0, locations: [], firstMsg: ruffMatch[3] }
      c.count++
      if (c.locations.length < 3) c.locations.push(ruffMatch[1])
      totalErrors++
      rules.set(rule, c)
      continue
    }
  }

  if (rules.size === 0) return text

  const out: string[] = []
  out.push(`${totalErrors} errors · ${totalWarnings} warnings grouped by rule:`)
  out.push('')

  const sorted = [...rules.entries()].sort((a, b) => b[1].count - a[1].count)
  for (const [rule, data] of sorted) {
    const locs = data.locations.join(', ')
    out.push(`  ${rule} × ${data.count}  (${locs})  — ${data.firstMsg}`)
  }

  const result = out.join('\n')
  return result.length > 0 && result.length < text.length ? result : text
}
;(lintGrouper as unknown as { filterName: string }).filterName = 'lint-grouper'
