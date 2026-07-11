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
 * Registry declarativo de filtros de saída. Cada filtro é `{ name, priority,
 * detect, apply }`. `detectFilter` percorre por prioridade (menor = antes) e
 * devolve o primeiro cujo `detect` casa. Adicionar cobertura = registrar 1 objeto
 * (built-in ou custom via {@link registerFilter}) — não mexe no núcleo. Substitui
 * o `if`-chain de `autodetect.ts` SEM mudar comportamento (mesma ordem/condições).
 */
import { DETECT_WINDOW as DW, READ_NUMBERED_MIN_HIT_RATIO, SMART_TRUNCATE_MIN_LINES } from './constants.js'
import { gitDiff } from './filters/gitDiff.js'
import { gitStatus } from './filters/gitStatus.js'
import { buildOutput } from './filters/buildOutput.js'
import { grep } from './filters/grep.js'
import { find } from './filters/find.js'
import { dedupLog } from './filters/dedupLog.js'
import { ls } from './filters/ls.js'
import { tree } from './filters/tree.js'
import { smartTruncate } from './filters/smartTruncate.js'
import { readNumbered, READ_NUMBERED_LINE_RE } from './filters/readNumbered.js'
import { searchList, SEARCH_LIST_HEADER_RE } from './filters/searchList.js'
import { testRunner } from './filters/testRunner.js'
import { lintReport } from './filters/lintReport.js'
import { gitLog } from './filters/gitLog.js'
import { failureFocus } from './filters/failureFocus.js'
import { lintGrouper } from './filters/lintGrouper.js'

const DETECT_WINDOW = DW

export type FilterFn = (text: string) => string

/** Contexto pré-computado p/ os `detect` (evita recomputar split por filtro). */
export interface DetectCtx {
  /** Janela inicial (até DETECT_WINDOW bytes) — a maioria detecta aqui. */
  readonly head: string
  /** Texto completo (readNumbered/smartTruncate olham o total de linhas). */
  readonly full: string
  /** Linhas da janela. */
  readonly headLines: string[]
  /** Linhas não-vazias da janela. */
  readonly nonEmpty: string[]
}

export interface CompressFilter {
  readonly name: string
  /** Menor = avaliado antes. Built-ins ocupam 10..140 (espaço p/ custom no meio). */
  readonly priority: number
  readonly detect: (ctx: DetectCtx) => boolean
  readonly apply: FilterFn
}

// ── Regexes (idênticos ao autodetect original) ────────────────────────────────
const RE_GIT_DIFF = /^diff --git /m
const RE_GIT_DIFF_HUNK = /^@@ /m
const RE_GIT_STATUS = /^On branch |^nothing to commit|^Changes (not |to be )|^Untracked files:/m
const RE_PORCELAIN = /^[ MADRCU?!][ MADRCU?!] \S/m
const RE_BUILD_OUTPUT =
  /^(npm (warn|error|ERR!)|yarn (warn|error)|\s*Compiling\s+\S+|\s*Downloading\s+\S+|added \d+ package|\[ERROR\]|BUILD (SUCCESS|FAILED)|\s*Finished\s+|Successfully (installed|built)|ERROR:)/im
const RE_TREE_GLYPH = /[├└]──|│ {2}/
const RE_TSC = /\(\d+,\d+\):\s+(error|warning)\s+TS\d+:|^Found\s+\d+\s+errors?/m
const RE_ESLINT = /^[✖✗x]\s+\d+\s+problems?\s*\(|^\s*\d+:\d+\s+(error|warning)\s+.+\s{2,}[@\w/-]+\s*$/m
// ruff/flake8/pylint: `path:line:col: CODE message`
const RE_PYLINT = /^[^\s:]+:\d+:\d+:\s+[A-Z]\d+\b/m
const RE_VITEST =
  /^\s*(RUN|DEV)\s+v?\d|^\s*[✓×❯]\s.*\.(test|spec)\.|^\s*Test Files\s+\d|^\s*Tests\s+\d+\s+(failed|passed)/m
const RE_JEST = /^(PASS|FAIL)\s+.*\.(test|spec)\.|^Tests:\s+\d/m
const RE_PYTEST = /^=+\s*test session starts\s*=+|^\S+\.py\s+[.FEsxX]+|^=+.*\b(passed|failed)\b.*=+\s*$/m
// go test / cargo test / rspec
const RE_GOTEST = /^(=== RUN |--- (FAIL|PASS):|ok\s+\S+\s+[\d.]+s|FAIL\s+\S+\s)/m
const RE_CARGOTEST = /^(running \d+ tests?$|test \S.* \.\.\. (ok|FAILED)$|test result:)/m
const RE_RSPEC = /^\d+ examples?, \d+ failures?|^Failure\/Error:|^Failures:\s*$/m
const RE_LS_ROW = /^[-dlbcps][rwx-]{9}/m
const RE_LS_TOTAL = /^total \d+$/m
const RE_GIT_LOG = /^commit [0-9a-f]{40}$/m

// ── Helpers (idênticos ao autodetect original) ────────────────────────────────
function isGrepLine(line: string): boolean {
  const first = line.indexOf(':')
  if (first === -1) return false
  const second = line.indexOf(':', first + 1)
  if (second === -1) return false
  return /^\d+$/.test(line.slice(first + 1, second))
}

function isPathLike(line: string): boolean {
  const t = line.trim()
  if (t.length === 0) return false
  if (t.includes(':')) return false
  return t.startsWith('.') || t.startsWith('/') || t.includes('/')
}

function isMostlyPorcelain(head: string): boolean {
  const lines = head.split('\n').filter((l) => l.trim())
  if (lines.length < 3) return false
  const hits = lines.filter((l) => RE_PORCELAIN.test(l)).length
  return hits / lines.length >= 0.6
}

function isLineNumbered(lines: string[]): boolean {
  let hits = 0
  let nonEmpty = 0
  for (const l of lines.slice(0, 100)) {
    if (l.length === 0) continue
    nonEmpty++
    if (READ_NUMBERED_LINE_RE.test(l)) hits++
  }
  if (nonEmpty < 5) return false
  return hits / nonEmpty >= READ_NUMBERED_MIN_HIT_RATIO
}

function countMatches(text: string, re: RegExp): number {
  // eslint-disable-next-line security/detect-non-literal-regexp
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
  return (text.match(g) || []).length
}

// ── Built-ins (prioridade = ordem exata do if-chain original) ─────────────────
const BUILTIN_FILTERS: CompressFilter[] = [
  {
    name: 'git-diff',
    priority: 10,
    apply: gitDiff,
    detect: (c) => RE_GIT_DIFF.test(c.head) || RE_GIT_DIFF_HUNK.test(c.head),
  },
  { name: 'git-log', priority: 15, apply: gitLog, detect: (c) => RE_GIT_LOG.test(c.head) },
  { name: 'git-status', priority: 20, apply: gitStatus, detect: (c) => RE_GIT_STATUS.test(c.head) },
  {
    name: 'lint-report',
    priority: 30,
    apply: lintReport,
    detect: (c) => RE_TSC.test(c.head) || RE_ESLINT.test(c.head) || RE_PYLINT.test(c.head),
  },
  {
    name: 'lint-grouper',
    priority: 32,
    apply: lintGrouper,
    detect: (c) => (RE_TSC.test(c.head) || RE_ESLINT.test(c.head)) && c.nonEmpty.length >= 10,
  },
  {
    name: 'test-runner',
    priority: 40,
    apply: testRunner,
    detect: (c) =>
      RE_VITEST.test(c.head) ||
      RE_JEST.test(c.head) ||
      RE_PYTEST.test(c.head) ||
      RE_GOTEST.test(c.head) ||
      RE_CARGOTEST.test(c.head) ||
      RE_RSPEC.test(c.head),
  },
  {
    name: 'failure-focus',
    priority: 42,
    apply: failureFocus,
    detect: (c) => (RE_VITEST.test(c.head) || RE_JEST.test(c.head)) && c.nonEmpty.length >= 10,
  },
  { name: 'build-output', priority: 50, apply: buildOutput, detect: (c) => RE_BUILD_OUTPUT.test(c.head) },
  // 2ª checagem de git-status (porcelain), exatamente como no original: após build-output.
  { name: 'git-status-porcelain', priority: 60, apply: gitStatus, detect: (c) => isMostlyPorcelain(c.head) },
  { name: 'grep', priority: 70, apply: grep, detect: (c) => c.nonEmpty.slice(0, 5).some(isGrepLine) },
  { name: 'find', priority: 80, apply: find, detect: (c) => c.nonEmpty.length >= 3 && c.nonEmpty.every(isPathLike) },
  { name: 'tree', priority: 90, apply: tree, detect: (c) => RE_TREE_GLYPH.test(c.head) },
  {
    name: 'ls',
    priority: 100,
    apply: ls,
    detect: (c) => RE_LS_TOTAL.test(c.head) || countMatches(c.head, RE_LS_ROW) >= 3,
  },
  { name: 'search-list', priority: 110, apply: searchList, detect: (c) => SEARCH_LIST_HEADER_RE.test(c.head) },
  {
    name: 'read-numbered',
    priority: 120,
    apply: readNumbered,
    detect: (c) => c.headLines.length >= SMART_TRUNCATE_MIN_LINES && isLineNumbered(c.headLines),
  },
  { name: 'dedup-log', priority: 130, apply: dedupLog, detect: (c) => c.nonEmpty.length >= 5 },
  {
    name: 'smart-truncate',
    priority: 140,
    apply: smartTruncate,
    detect: (c) => c.full.split('\n').length >= SMART_TRUNCATE_MIN_LINES,
  },
]

// Filtros registrados em runtime (custom/declarativos). Mantidos à parte p/ reset.
const customFilters: CompressFilter[] = []

/** Registra um filtro adicional (built-in espelhado ou custom declarativo). */
export function registerFilter(filter: CompressFilter): void {
  customFilters.push(filter)
}

/** Remove todos os filtros custom registrados (apenas testes/reload). */
export function clearCustomFilters(): void {
  customFilters.length = 0
}

/** Lista (ordenada por prioridade) de todos os filtros ativos — p/ inspeção/docs. */
export function listFilters(): ReadonlyArray<{ name: string; priority: number }> {
  return allFilters().map((f) => ({ name: f.name, priority: f.priority }))
}

function allFilters(): CompressFilter[] {
  return [...BUILTIN_FILTERS, ...customFilters].sort((a, b) => a.priority - b.priority)
}

/** Constrói o contexto de detecção uma vez por texto. */
function buildCtx(text: string): DetectCtx {
  const head = text.length > DETECT_WINDOW ? text.slice(0, DETECT_WINDOW) : text
  const headLines = head.split('\n')
  return { head, full: text, headLines, nonEmpty: headLines.filter((l) => l.trim().length > 0) }
}

/** Detecta o filtro para `text`, ou `null` se nenhum casa. */
export function detectFilter(text: string): CompressFilter | null {
  const ctx = buildCtx(text)
  for (const f of allFilters()) {
    try {
      if (f.detect(ctx)) return f
    } catch {
      // detect nunca deve derrubar a detecção — filtro problemático é ignorado.
    }
  }
  return null
}

/** Compat: devolve a função `apply` do filtro detectado (com `.filterName`). */
export function autoDetectFilter(text: string): FilterFn | null {
  return detectFilter(text)?.apply ?? null
}
