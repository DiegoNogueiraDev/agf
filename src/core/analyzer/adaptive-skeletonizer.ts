/*!
 * SPDX-License-Identifier: MIT
 * Copyright © 2026 Colby Mchenry (codegraph)
 * Copyright © 2026 Diego Lima Nogueira de Paula (TypeScript port and changes)
 *
 * Ported from codegraph (https://github.com/colbymchenry/codegraph), MIT.
 * This file stays under its original MIT terms; agent-graph-flow as a whole
 * is Apache-2.0. See THIRD-PARTY-NOTICES.md.
 */

/**
 * AdaptiveSkeletonizer — replaces off-spine polymorphic sibling bodies with
 * stub signatures. Ported from codegraph adaptive skeletonization.
 *
 * Design:
 *   - buildSkeletonizePlan: given PolymorphicSupertype[], picks spine + off-spine
 *   - skeletonizeCode: replaces class/function bodies with stub
 *
 * Body replacement uses brace-depth matching with awareness of strings,
 * comments, template literals, and regex literals to preserve syntax validity.
 */

import type { PolymorphicSupertype } from './polymorphic-sibling-detector.js'
import { detectPolymorphicSiblings } from './polymorphic-sibling-detector.js'
import type { CodeStore } from '../code/code-store.js'

export interface SkeletonizeSymbol {
  name: string
  /** 1-indexed line number of the class/function declaration */
  line: number
}

export interface SkeletonizeResult {
  text: string
  skeletonizedCount: number
  skeletonized: string[]
}

export interface SkeletonizePlan {
  spine: string | null
  skeletonize: SkeletonizeSymbol[]
}

export interface SkeletonizeOptions {
  preferredSpine?: string
}

const SKELETONIZED_MARKER = '/* Skeletonized by adaptive skeletonizer */'

function skipString(text: string, start: number, quote: string): number {
  let i = start + 1
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2
      continue
    }
    if (text[i] === quote) return i + 1
    if (quote === '`' && text[i] === '$' && i + 1 < text.length && text[i + 1] === '{') {
      return i // stop at template expression start
    }
    i++
  }
  return text.length
}

function skipLineComment(text: string, start: number): number {
  const nl = text.indexOf('\n', start)
  return nl === -1 ? text.length : nl + 1
}

function skipBlockComment(text: string, start: number): number {
  const end = text.indexOf('*/', start + 2)
  return end === -1 ? text.length : end + 2
}

function skipRegex(text: string, start: number): number {
  let i = start + 1
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2
      continue
    }
    if (text[i] === '/') return i + 1
    i++
  }
  return text.length
}

/**
 * Find the matching closing brace for the opening brace at `bracePos`.
 * Handles strings, comments, template literals, and regex literals.
 */
function findMatchingBrace(text: string, bracePos: number): number {
  let depth = 1
  let i = bracePos + 1

  while (i < text.length && depth > 0) {
    const ch = text[i]

    // Skip strings
    if (ch === '"' || ch === "'") {
      i = skipString(text, i, ch)
      continue
    }

    // Skip template literals
    if (ch === '`') {
      const afterTpl = skipString(text, i, '`')
      if (afterTpl === i + 1) {
        // empty template ``
        i = afterTpl
        continue
      }
      // Template literal may contain ${} - the skipString handles this
      // by returning at $ if { follows. We need to handle the full template.
      const end = text.indexOf('`', i + 1)
      i = end === -1 ? text.length : end + 1
      continue
    }

    // Skip comments
    if (ch === '/' && i + 1 < text.length) {
      if (text[i + 1] === '/') {
        i = skipLineComment(text, i)
        continue
      }
      if (text[i + 1] === '*') {
        i = skipBlockComment(text, i)
        continue
      }
    }

    // Skip regex literals (when preceded by certain tokens)
    if (ch === '/' && i > 0) {
      const prev = text[i - 1]
      if (/[\]=!&|?:,({};^<>\s]/.test(prev)) {
        const end = skipRegex(text, i)
        if (end > i + 1) {
          i = end
          continue
        }
      }
    }

    // Count braces
    if (ch === '{') depth++
    else if (ch === '}') depth--

    if (depth === 0) return i
    i++
  }

  return -1
}

/**
 * Find the opening brace `{` on the given line or subsequent continuation lines.
 */
function findOpeningBrace(lines: string[], lineIdx: number): { line: number; col: number } | null {
  for (let l = lineIdx; l < lines.length; l++) {
    const col = lines[l].indexOf('{')
    if (col !== -1) return { line: l, col }
  }
  return null
}

/**
 * Skeletonize class/function bodies: replace body content (from `{` to matching
 * `}`) with a stub marker. Returns modified source text and count of changes.
 */
export function skeletonizeCode(source: string, symbols: SkeletonizeSymbol[]): SkeletonizeResult {
  if (symbols.length === 0) return { text: source, skeletonizedCount: 0, skeletonized: [] }

  const lines = source.split('\n')
  const skeletonized: string[] = []

  // Sort by line descending so we replace from bottom to top (preserves offsets)
  const sorted = [...symbols].sort((a, b) => b.line - a.line)

  for (const sym of sorted) {
    const lineIdx = sym.line - 1 // convert to 0-indexed
    if (lineIdx < 0 || lineIdx >= lines.length) continue

    // Verify the line contains the symbol name
    if (!lines[lineIdx].includes(sym.name)) continue

    // Find opening brace on or after the declaration line
    const brace = findOpeningBrace(lines, lineIdx)
    if (!brace) continue

    // Build a full text from this brace position onward
    const globalPos = lines.slice(0, brace.line).join('\n').length + (brace.line > 0 ? 1 : 0) + brace.col
    const rest = source.slice(globalPos)

    const matchingBrace = findMatchingBrace(rest, 0)
    if (matchingBrace === -1) continue

    const bodyStart = globalPos // position of `{`
    const bodyEnd = globalPos + matchingBrace // position of `}`

    // Replace from `{` to `}` inclusive with the stub
    const before = source.slice(0, bodyStart)
    const after = source.slice(bodyEnd + 1)
    source = `${before}{ ${SKELETONIZED_MARKER} }${after}`

    skeletonized.push(sym.name)
  }

  return {
    text: source,
    skeletonizedCount: skeletonized.length,
    skeletonized,
  }
}

/**
 * Build a skeletonize plan from polymorphic supertype data.
 * Designates one implementation as "spine" (keeps full source) and the rest
 * as off-spine (get skeletonized to signatures-only).
 *
 * Spine selection (by priority):
 *   1. preferredSpine option (if name exists in implementations)
 *   2. Alphabetically first implementation (deterministic)
 */
export function buildSkeletonizePlan(
  polymorphicSupertypes: PolymorphicSupertype[],
  options?: SkeletonizeOptions,
): SkeletonizePlan {
  if (polymorphicSupertypes.length === 0) {
    return { spine: null, skeletonize: [] }
  }

  // Collect all implementations from all polymorphic groups with ≥3 impls
  const skeletonize: SkeletonizeSymbol[] = []
  let spine: string | null = null

  for (const group of polymorphicSupertypes) {
    const impls = group.implementations
    if (impls.length < 3) continue

    const byName = [...impls].sort((a, b) => a.name.localeCompare(b.name))

    // Pick spine
    const spineName =
      options?.preferredSpine && impls.some((i) => i.name === options.preferredSpine)
        ? options.preferredSpine
        : byName[0].name

    if (!spine) spine = spineName

    // Off-spine siblings get skeletonized
    for (const impl of impls) {
      if (impl.name !== spineName) {
        skeletonize.push({ name: impl.name, line: 1 }) // line will be resolved at skeletonize time
      }
    }
  }

  return { spine, skeletonize }
}

export interface SkeletonizeReportEntry {
  superName: string
  superFile: string
  implementationCount: number
  spine: string | null
  skeletonize: string[]
}

/**
 * Detect polymorphic supertypes in the indexed code graph and build a
 * skeletonize plan for each — dry-run report, no file writes. This is the
 * surface wiring point for detectPolymorphicSiblings + buildSkeletonizePlan
 * (consumed by `agf code skeleton-plan`).
 */
export function buildSkeletonizeReport(codeStore: CodeStore, projectId: string): SkeletonizeReportEntry[] {
  const supertypes = detectPolymorphicSiblings(codeStore, projectId)
  return supertypes
    .map((group) => {
      const plan = buildSkeletonizePlan([group])
      return {
        superName: group.superName,
        superFile: group.superFile,
        implementationCount: group.implementationCount,
        spine: plan.spine,
        skeletonize: plan.skeletonize.map((s) => s.name),
      }
    })
    .filter((entry) => entry.spine !== null)
}
