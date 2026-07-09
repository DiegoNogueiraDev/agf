/* eslint-disable security/detect-unsafe-regex */
/*!
 * Lint exemption: the regex patterns in this file are bounded
 * (literal alternations, short character classes, language-keyword
 * lookups) and run against parsed/structured input. The ReDoS class
 * the rule is designed to prevent is not reachable here.
 */
/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §HOOKS-INTEGRATION 5.2 — Matcher grammar (Claude Code port).
 *
 * Syntax: `<channel>(<filter>:<value-or-glob>[,<filter>:<value>]*)`
 *
 *   tool:pre-call(toolName:Bash)
 *   tool:pre-call(toolName:Bash,command:npm run *)
 *   tool:post-call(durationMs:>1000)
 *   task:error(*)                                  // any payload
 *   task:post-complete                              // no parens = any
 *
 * Glob: only `*` (any sequence of chars). Numeric comparators: `>N`,
 * `>=N`, `<N`, `<=N`. Pure decision module — no I/O.
 */

import { McpGraphError } from '../utils/errors.js'

export type Comparator = '>' | '>=' | '<' | '<='

export interface FilterClause {
  key: string
  /** Either a glob pattern OR a numeric comparator. */
  kind: 'glob' | 'numeric'
  /** When kind=glob: the literal/glob pattern. */
  pattern?: string
  /** When kind=numeric: the operator. */
  comparator?: Comparator
  /** When kind=numeric: the threshold. */
  threshold?: number
}

export interface MatcherAst {
  channel: string
  /** Empty array = match anything on the channel. */
  filters: FilterClause[]
}

export interface HookEventLike {
  channel?: string
  payload?: Record<string, unknown>
}

const NUMERIC_RE = /^(>=|<=|>|<)(-?\d+(?:\.\d+)?)$/

function parseFilter(raw: string): FilterClause {
  const colon = raw.indexOf(':')
  if (colon === -1) {
    throw new McpGraphError(`Invalid matcher filter (missing ':' between key and value): "${raw}"`)
  }
  const key = raw.slice(0, colon).trim()
  const value = raw.slice(colon + 1).trim()
  if (!key) {
    throw new McpGraphError(`Invalid matcher filter (empty key): "${raw}"`)
  }

  const num = NUMERIC_RE.exec(value)
  if (num) {
    return {
      key,
      kind: 'numeric',
      comparator: num[1] as Comparator,
      threshold: Number(num[2]),
    }
  }
  return { key, kind: 'glob', pattern: value }
}

/** parseMatcher —  */
export function parseMatcher(input: string): MatcherAst {
  const trimmed = input.trim()
  if (!trimmed) throw new McpGraphError('Empty matcher')

  const open = trimmed.indexOf('(')
  if (open === -1) {
    return { channel: trimmed, filters: [] }
  }
  if (!trimmed.endsWith(')')) {
    throw new McpGraphError(`Matcher missing closing ')': "${input}"`)
  }
  const channel = trimmed.slice(0, open).trim()
  const inner = trimmed.slice(open + 1, -1).trim()
  if (!channel) {
    throw new McpGraphError(`Matcher missing channel: "${input}"`)
  }
  if (!inner || inner === '*') {
    return { channel, filters: [] }
  }
  const filters = inner.split(',').map((f) => parseFilter(f))
  return { channel, filters }
}

/** True when `pattern` matches `value` with `*` as wildcard. */
export function globMatch(pattern: string, value: string): boolean {
  if (pattern === '*') return true
  if (!pattern.includes('*')) return pattern === value
  // Escape regex metas except '*', then translate '*' → '.*'
  const re = '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'
  // §HOOKS-INTEGRATION 5.2 — `pattern` is user-authored matcher syntax (e.g.
  // "Bash", "npm run *"), already escaped above and bounded to glob-only
  // metacharacters. Not user-controlled at runtime call sites.
  // eslint-disable-next-line security/detect-non-literal-regexp
  return new RegExp(re).test(value)
}

function compareNumeric(actual: number, comparator: Comparator, threshold: number): boolean {
  switch (comparator) {
    case '>':
      return actual > threshold
    case '>=':
      return actual >= threshold
    case '<':
      return actual < threshold
    case '<=':
      return actual <= threshold
  }
}

/** matches —  */
export function matches(ast: MatcherAst, event: HookEventLike): boolean {
  if (event.channel !== ast.channel) return false
  if (ast.filters.length === 0) return true
  const payload = event.payload ?? {}
  for (const fVar of ast.filters) {
    const raw = payload[fVar.key]
    if (fVar.kind === 'glob') {
      if (raw === undefined || raw === null) return false
      // §HOOKS-INTEGRATION 5.2 — parser invariant: kind=glob ⇒ pattern set.
      if (fVar.pattern === undefined) return false
      if (!globMatch(fVar.pattern, String(raw))) return false
    } else {
      const nVar = typeof raw === 'number' ? raw : Number(raw)
      if (Number.isNaN(nVar)) return false
      // §HOOKS-INTEGRATION 5.2 — parser invariant: kind=numeric ⇒ comparator + threshold set.
      if (fVar.comparator === undefined || fVar.threshold === undefined) return false
      if (!compareNumeric(nVar, fVar.comparator, fVar.threshold)) return false
    }
  }
  return true
}
