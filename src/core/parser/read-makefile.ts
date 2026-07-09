/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §Task 3.5 subtask -- Makefile parser: extracts targets and their dependencies.
 * Deterministic — pure regex over raw text, zero LLM calls, no new dependencies.
 */

import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'read-makefile.ts' })

export interface MakefileEntry {
  target: string
  deps: string[]
  isPhony: boolean
}

export interface ParsedMakefile {
  entries: MakefileEntry[]
  raw: string
}

const PHONY_RE = /^\.PHONY\s*:\s*(.+)/
const TARGET_RE = /^([\w.][^\s:]*)\s*:([^=].*)?$/

/** Parse Makefile content and extract targets with dependencies (best-effort). */
export function parseMakefile(content: string): ParsedMakefile {
  if (!content.trim()) return { entries: [], raw: content }

  const phonySet = new Set<string>()
  const targetMap = new Map<string, string[]>()

  for (const raw of content.split('\n')) {
    const line = raw
    if (!line.trim() || line.startsWith('#') || line.startsWith('\t')) continue

    const phonyMatch = PHONY_RE.exec(line)
    if (phonyMatch) {
      const names = (phonyMatch[1] ?? '').trim().split(/\s+/)
      for (const n of names) {
        if (n) phonySet.add(n)
      }
      continue
    }

    const targetMatch = TARGET_RE.exec(line)
    if (targetMatch) {
      const target = targetMatch[1] ?? ''
      const depStr = (targetMatch[2] ?? '').trim()
      const deps = depStr ? depStr.split(/\s+/).filter(Boolean) : []
      if (target && !targetMap.has(target)) {
        targetMap.set(target, deps)
      }
    }
  }

  const entries: MakefileEntry[] = []
  for (const [target, deps] of targetMap) {
    entries.push({ target, deps, isPhony: phonySet.has(target) })
  }

  log.debug('read-makefile:parsed', { entriesCount: entries.length })
  return { entries, raw: content }
}
