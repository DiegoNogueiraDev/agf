/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Field projection for the JSON output envelope (`--select`).
 *
 * Deterministic, zero-dep, frugal: builds a NEW object containing only the
 * selected dot-paths — never deep-clones the full envelope, never recurses
 * into unselected branches, so a large `data` only ever gets smaller.
 *
 * Paths are comma-split upstream and passed here as a string[]. Each path is a
 * dot-path from the envelope root, e.g. `data.node.id`. A path crossing an
 * array projects the remaining segments across every element. The invariant
 * fields `ok`, `code`, `error`, `meta` are always retained. If no path
 * resolves (or the list is empty), the full envelope is returned unchanged —
 * projection never throws on a bad path, to stay LLM-friendly.
 */

import type { OutputEnvelope } from './envelope.js'

type Projected = { value: unknown; found: boolean }

const WILDCARD = '*'
const INDEX_PREFIX = '#'

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/**
 * Tokenize a dot-path into navigation tokens, expanding bracket array syntax.
 *
 * - `data.*.id`  → `['data', '*', 'id']`
 * - `data[].id`  → `['data', '*', 'id']`   (bare `[]` ≡ `*`)
 * - `data[1].id` → `['data', '#1', 'id']`  (positive index)
 * - `nodes[0][]` → `['nodes', '#0', '*']`
 */
function tokenizePath(path: string): string[] {
  const tokens: string[] = []
  for (const seg of path.split('.')) {
    if (seg === '') continue
    if (seg === WILDCARD) {
      tokens.push(WILDCARD)
      continue
    }
    const m = /^([^[\]]*)((?:\[\d*\])*)$/.exec(seg)
    if (!m) {
      tokens.push(seg)
      continue
    }
    const [, name, brackets] = m
    if (name) tokens.push(name)
    for (const b of brackets.match(/\[\d*\]/g) ?? []) {
      const inner = b.slice(1, -1)
      tokens.push(inner === '' ? WILDCARD : `${INDEX_PREFIX}${inner}`)
    }
  }
  return tokens
}

/** Fan a remaining token list out across every element of an array. */
function fanOut(source: unknown[], rest: string[]): Projected {
  const arr: unknown[] = []
  let foundAny = false
  for (const item of source) {
    const r = projectPath(item, rest)
    if (r.found) {
      arr.push(r.value)
      foundAny = true
    }
  }
  return { value: arr, found: foundAny }
}

/** Build the pruned value for a single token list against `source`. */
function projectPath(source: unknown, tokens: string[]): Projected {
  if (tokens.length === 0) return { value: source, found: source !== undefined }

  const [head, ...rest] = tokens

  // Explicit wildcard / `[]`: fan the rest out over each array element.
  if (head === WILDCARD) {
    if (!Array.isArray(source)) return { value: undefined, found: false }
    return fanOut(source, rest)
  }

  // Explicit index `[N]`: descend into one element, returning its value as-is.
  if (head.startsWith(INDEX_PREFIX)) {
    if (!Array.isArray(source)) return { value: undefined, found: false }
    const i = Number(head.slice(INDEX_PREFIX.length))
    if (!Number.isInteger(i) || i < 0 || i >= source.length) return { value: undefined, found: false }
    const r = projectPath(source[i], rest)
    if (!r.found) return { value: undefined, found: false }
    return { value: r.value, found: true }
  }

  // Implicit array fan-out: a named key applied to an array projects across
  // every element (backward-compatible with `data.nodes.id`).
  if (Array.isArray(source)) {
    return fanOut(source, tokens)
  }

  if (isPlainObject(source) && head in source) {
    const r = projectPath(source[head], rest)
    if (!r.found) return { value: undefined, found: false }
    return { value: { [head]: r.value }, found: true }
  }
  return { value: undefined, found: false }
}

/** Deep-merge two projected partials (objects merge by key, arrays by index). */
function deepMerge(a: unknown, b: unknown): unknown {
  if (a === undefined) return b
  if (b === undefined) return a
  if (Array.isArray(a) && Array.isArray(b)) {
    const len = Math.max(a.length, b.length)
    const out: unknown[] = []
    for (let i = 0; i < len; i++) out.push(deepMerge(a[i], b[i]))
    return out
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const out: Record<string, unknown> = { ...a }
    for (const k of Object.keys(b)) out[k] = k in a ? deepMerge(a[k], b[k]) : b[k]
    return out
  }
  return b
}

/**
 * Project an envelope down to the selected dot-paths, always keeping the
 * `ok`/`code`/`error`/`meta` invariants. Returns the original envelope when
 * `paths` is empty or nothing resolves.
 */
export function projectEnvelope<T>(env: OutputEnvelope<T>, paths: string[]): OutputEnvelope {
  if (!paths || paths.length === 0) return env

  let acc: unknown
  let anyFound = false
  for (const raw of paths) {
    const path = raw.trim()
    if (!path) continue
    const r = projectPath(env, tokenizePath(path))
    if (!r.found) continue
    anyFound = true
    acc = acc === undefined ? r.value : deepMerge(acc, r.value)
  }

  if (!anyFound || !isPlainObject(acc)) return env

  // Reassemble in the canonical envelope order: ok, code?, <projected>, error?, meta.
  const projected = acc
  const result: Record<string, unknown> = { ok: env.ok }
  if (env.code !== undefined) result.code = env.code
  for (const k of Object.keys(projected)) {
    if (k === 'ok' || k === 'code' || k === 'error' || k === 'meta') continue
    result[k] = projected[k]
  }
  if (env.error !== undefined) result.error = env.error
  result.meta = env.meta
  return result as unknown as OutputEnvelope
}
