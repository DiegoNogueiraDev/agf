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

/**
 * lint-report — agrega saída de lint/type-check (eslint stylish, tsc) por
 * regra/código: "no-unused-vars × 12" em vez de 12 linhas soltas, mantendo as
 * primeiras N localizações por regra e o sumário final. Determinístico, 0 token.
 */
import { LINT_REPORT_TOP_LOCATIONS } from '../constants.js'

// eslint stylish: `  12:5  warning  'x' is assigned ...  no-unused-vars`
const RE_ESLINT_LOC = /^\s*(\d+):(\d+)\s+(error|warning)\s+(.*?)\s{2,}([@\w/-]+)\s*$/
const RE_ESLINT_SUMMARY = /^[✖✗x]\s+\d+\s+problems?/i
// eslint file header: caminho próprio numa linha (sem espaços), termina em .ext
const RE_FILE_HEADER = /^(?:\/|\.{1,2}\/|[A-Za-z]:\\)\S+\.\w+$/
// tsc: `src/foo.ts(12,5): error TS6133: 'x' is declared but never used.`
const RE_TSC_LINE = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.*)$/
const RE_TSC_SUMMARY = /^Found\s+\d+\s+error/i
// ruff/flake8/pylint: `path:line:col: CODE message` (CODE = letra(s)+dígitos)
const RE_PYLINT_LINE = /^(.+?):(\d+):(\d+):\s+([A-Z]+\d+)\s+(.*)$/
// severidade por prefixo do código (E/F/C/R = erro-ish; W = warning)
function pylintSeverity(code: string): string {
  return /^[WD]/.test(code) ? 'warning' : 'error'
}

interface Hit {
  loc: string
  severity: string
  msg: string
}

function severityLabel(hits: Hit[]): string {
  const errs = hits.filter((h) => h.severity === 'error').length
  const warns = hits.length - errs
  const plural = (n: number, w: string): string => `${n} ${w}${n > 1 ? 's' : ''}`
  if (errs > 0 && warns > 0) return `${plural(errs, 'error')}, ${plural(warns, 'warning')}`
  if (errs > 0) return plural(errs, 'error')
  return plural(warns, 'warning')
}

/** Aggregate lint/type-check output (ESLint, TSC, Ruff) by rule, showing counts and top `LINT_REPORT_TOP_LOCATIONS` locations per rule instead of every raw line. */
export function lintReport(input: string): string {
  const lines = input.split('\n')
  if (lines.length === 0) return input

  const byRule = new Map<string, Hit[]>()
  const summary: string[] = []
  let currentFile = ''

  const push = (rule: string, hit: Hit): void => {
    const arr = byRule.get(rule) ?? []
    arr.push(hit)
    byRule.set(rule, arr)
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    if (line.trim() === '') continue

    const tsc = RE_TSC_LINE.exec(line)
    if (tsc) {
      push(tsc[5], { loc: `${tsc[1]}:${tsc[2]}:${tsc[3]}`, severity: tsc[4], msg: tsc[6].trim() })
      continue
    }

    const py = RE_PYLINT_LINE.exec(line)
    if (py) {
      push(py[4], { loc: `${py[1]}:${py[2]}:${py[3]}`, severity: pylintSeverity(py[4]), msg: py[5].trim() })
      continue
    }

    if (RE_ESLINT_SUMMARY.test(line) || RE_TSC_SUMMARY.test(line)) {
      summary.push(line.trim())
      continue
    }

    const es = RE_ESLINT_LOC.exec(line)
    if (es) {
      push(es[5], { loc: `${currentFile}:${es[1]}:${es[2]}`, severity: es[3], msg: es[4].trim() })
      continue
    }

    if (RE_FILE_HEADER.test(line)) {
      currentFile = line.trim()
      continue
    }
  }

  if (byRule.size === 0) return input

  const rules = [...byRule.entries()].sort((a, b) => b[1].length - a[1].length)
  const parts: string[] = []
  for (const [rule, hits] of rules) {
    parts.push(`${rule} × ${hits.length} (${severityLabel(hits)}) — ${hits[0].msg}`)
    for (const h of hits.slice(0, LINT_REPORT_TOP_LOCATIONS)) parts.push(`  ${h.loc}`)
    if (hits.length > LINT_REPORT_TOP_LOCATIONS) {
      parts.push(`  ... +${hits.length - LINT_REPORT_TOP_LOCATIONS} more`)
    }
  }
  if (summary.length > 0) parts.push(...summary)

  const out = parts.join('\n')
  return out.length > 0 && out.length < input.length ? out : input
}

lintReport.filterName = 'lint-report'
