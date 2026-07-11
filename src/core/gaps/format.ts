/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Human rendering for the gaps report. On a mature graph a single detector can
 * fire thousands of times (e.g. weak ACs), so the human view GROUPS by kind,
 * CAPS per kind (`--limit`), and can FILTER by severity — while the JSON output
 * (for drivers) always carries the full report. Never silently truncates: the
 * dropped count is always shown.
 */

import type { Gap, GapKind, GapReport, GapSeverity } from './gap-types.js'

export interface GapsFormatOptions {
  /** Max gaps shown per kind (default 15). */
  limit?: number
  /** Show only this severity in the human view. */
  severity?: GapSeverity
}

const DEFAULT_LIMIT = 15

/** Render a gaps report as grouped, capped, human-readable text. Pure. */
export function formatGapsHuman(report: GapReport, opts: GapsFormatOptions = {}): string {
  const limit = opts.limit ?? DEFAULT_LIMIT
  const lines: string[] = []
  const verdict = report.ready ? '✓ COMPLETO' : '✗ LACUNAS'
  lines.push(`Gaps — ${verdict}  (score ${report.score}, grade ${report.grade})`)
  lines.push(`  ${report.summary}`)

  const byKind = new Map<GapKind, Gap[]>()
  for (const g of report.gaps) {
    if (opts.severity && g.severity !== opts.severity) continue
    const list = byKind.get(g.kind) ?? []
    list.push(g)
    byKind.set(g.kind, list)
  }

  if (byKind.size === 0) {
    lines.push(opts.severity ? `  (sem lacunas '${opts.severity}')` : '  (sem lacunas)')
    return lines.join('\n')
  }

  for (const [kind, gaps] of byKind) {
    lines.push('')
    lines.push(`  ${kind} (${gaps.length}):`)
    for (const g of gaps.slice(0, limit)) {
      const mark = g.severity === 'required' ? '✗' : '⚠'
      lines.push(`    ${mark} ${g.evidence}`)
      if (g.enrichment.applyVia[0]) lines.push(`       $ ${g.enrichment.applyVia[0]}`)
    }
    if (gaps.length > limit) {
      lines.push(`    … +${gaps.length - limit} mais (use --kind ${kind} --limit ${gaps.length})`)
    }
  }
  return lines.join('\n')
}
