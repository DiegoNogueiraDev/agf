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
 * A1 — 8-stage TOML filter pipeline (compress).
 *
 * Takes a TOML filter definition and applies each stage sequentially to
 * tool output text. Replaces the simple keep/drop regex with a full
 * declarative pipeline that achieves 60-90% compression.
 *
 * Stages (in order):
 *   1. strip_ansi        — remove ANSI escape codes
 *   2. replace           — regex substitutions with backreferences ($1, $2)
 *   3. match_output      — short-circuit: if text matches regex, return message
 *   4. strip_lines       — remove lines matching regex (or keep_lines: keep-only)
 *   5. truncate_lines_at — truncate each line to N chars
 *   6. head_lines        — keep first N lines (or tail_lines: keep last N)
 *   7. max_lines         — absolute line cap
 *   8. on_empty          — fallback message if result is empty
 */

export interface TomlPipelineStage {
  /** Stage 1: remove ANSI escape codes (boolean flag). */
  strip_ansi?: boolean
  /** Stage 2: array of [pattern, replacement] tuples. $1, $2 supported. */
  replace?: Array<[string, string]>
  /** Stage 3: if text matches regex, return message (skips remaining stages). */
  match_output?: string
  /** Regex patterns for match_output (must match at least one). */
  match_patterns?: string[]
  /** Stage 4a: regex patterns — lines matching ANY are removed. */
  strip_lines?: string[]
  /** Stage 4b: regex patterns — only lines matching ANY are kept. */
  keep_lines?: string[]
  /** Stage 5: truncate each line to N chars. */
  truncate_lines_at?: number
  /** Stage 6a: keep first N lines. */
  head_lines?: number
  /** Stage 6b: keep last N lines. */
  tail_lines?: number
  /** Stage 7: absolute line cap. */
  max_lines?: number
  /** Stage 8: fallback message if result is empty. */
  on_empty?: string
}

import { safeCompileRegex } from '../utils/safe-regexp.js'

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g
// eslint-disable-next-line no-control-regex
const ANSI_CSI = /\x1b\[[?]?\d*(?:;\d+)*[hlABCDEFGJKmnsu]|\x1b\].*?\x07|\x1b\[[\d;]*H|\x1b\[[\d;]*f/g

function compileRegex(pattern: string): RegExp | null {
  return safeCompileRegex(pattern)
}

/** Compile array of regex patterns, skipping invalid ones. */
function compileRegexes(patterns: string[] | undefined): RegExp[] {
  const out: RegExp[] = []
  for (const p of patterns ?? []) {
    const r = compileRegex(p)
    if (r) out.push(r)
  }
  return out
}

/** Stage 1: strip ANSI escape codes. */
function applyStripAnsi(text: string): string {
  return text.replace(ANSI_RE, '').replace(ANSI_CSI, '')
}

/** Stage 2: regex replacements, line-by-line. */
function applyReplace(text: string, rules: Array<[string, string]>): string {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const compiled = rules.map(([p, r]) => ({ re: compileRegex(p)!, sub: r })).filter((c) => c.re)
  if (compiled.length === 0) return text
  return text
    .split('\n')
    .map((line) => {
      let out = line
      for (const { re, sub } of compiled) {
        out = out.replace(re, sub)
      }
      return out
    })
    .join('\n')
}

/** Stage 4a: strip lines matching any regex. */
function applyStripLines(text: string, patterns: string[]): string {
  const res = compileRegexes(patterns)
  if (res.length === 0) return text
  const lines = text.split('\n')
  const kept = lines.filter((l) => !res.some((r) => r.test(l)))
  return kept.length === lines.length ? text : kept.join('\n')
}

/** Stage 4b: keep only lines matching any regex. */
function applyKeepLines(text: string, patterns: string[]): string {
  const res = compileRegexes(patterns)
  if (res.length === 0) return text
  const lines = text.split('\n')
  const kept = lines.filter((l) => res.some((r) => r.test(l)))
  return kept.join('\n')
}

/**
 * Apply the 8-stage TOML pipeline to text.
 * Returns the compressed text or original if pipeline produces worse/no result.
 */
export function applyTomlPipeline(text: string, stage: TomlPipelineStage): string {
  if (!text) return ''

  let out = text

  // Stage 1: strip ANSI
  if (stage.strip_ansi) {
    out = applyStripAnsi(out)
  }

  // Stage 2: regex replace
  if (stage.replace && stage.replace.length > 0) {
    out = applyReplace(out, stage.replace)
  }

  // Stage 3: match_output (short-circuit)
  if (stage.match_patterns && stage.match_patterns.length > 0) {
    const res = compileRegexes(stage.match_patterns)
    if (res.some((r) => r.test(out))) {
      return stage.match_output ?? out
    }
  }

  // Stage 4: strip_lines / keep_lines (mutually exclusive)
  if (stage.strip_lines && stage.strip_lines.length > 0) {
    out = applyStripLines(out, stage.strip_lines)
  } else if (stage.keep_lines && stage.keep_lines.length > 0) {
    out = applyKeepLines(out, stage.keep_lines)
  }

  if (!out) {
    return stage.on_empty ?? ''
  }

  // Stage 5: truncate_lines_at
  if (stage.truncate_lines_at != null && stage.truncate_lines_at > 0) {
    const limit = stage.truncate_lines_at
    out = out
      .split('\n')
      .map((l) => (l.length > limit ? l.slice(0, limit) : l))
      .join('\n')
  }

  // Stage 6: head_lines / tail_lines
  if (stage.head_lines != null && stage.head_lines > 0) {
    const lines = out.split('\n')
    if (lines.length > stage.head_lines) {
      out = lines.slice(0, stage.head_lines).join('\n')
    }
  } else if (stage.tail_lines != null && stage.tail_lines > 0) {
    const lines = out.split('\n')
    if (lines.length > stage.tail_lines) {
      out = lines.slice(-stage.tail_lines).join('\n')
    }
  }

  // Stage 7: max_lines
  if (stage.max_lines != null && stage.max_lines > 0) {
    const lines = out.split('\n')
    if (lines.length > stage.max_lines) {
      const head = Math.ceil(stage.max_lines * 0.6)
      const tail = stage.max_lines - head
      const truncated = lines
        .slice(0, head)
        .concat([`… +${lines.length - stage.max_lines} lines truncated`])
        .concat(lines.slice(-tail))
      out = truncated.join('\n')
    }
  }

  // Stage 8: on_empty
  if (!out && stage.on_empty) {
    out = stage.on_empty
  }

  // Safety: never return worse than original
  if (out.length >= text.length && out !== text) {
    return text
  }

  return out || text
}
