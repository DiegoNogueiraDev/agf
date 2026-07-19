/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Project language detection for RAG-OUT (local-first, no network).
 *
 * Recovering a scaffold of the wrong language is the "wrong scaffold" failure:
 * a Python project must never recover a TypeScript skeleton. We detect the
 * dominant language by file extension and let the gate guard on it.
 */

import { readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

export type Language =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'rust'
  | 'java'
  | 'kotlin'
  | 'ruby'
  | 'php'
  | 'csharp'
  | 'cpp'
  | 'c'
  | 'swift'
  | 'dart'
  | 'fsharp'
  | 'unknown'

const EXT_LANG: Record<string, Language> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.rb': 'ruby',
  '.php': 'php',
  '.cs': 'csharp',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.c': 'c',
  '.h': 'c',
  '.swift': 'swift',
  '.dart': 'dart',
  '.fs': 'fsharp',
  '.fsi': 'fsharp',
  '.fsx': 'fsharp',
}

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'target',
  '.next',
  'coverage',
  'vendor',
  '__pycache__',
  '.venv',
])
const MAX_FILES = 5000 // cap the walk for big repos

/** Map a file path to a language by extension, or null if not a known source. */
export function languageFromExtension(file: string): Language | null {
  return EXT_LANG[extname(file).toLowerCase()] ?? null
}

/** Detect the dominant project language by source-file count (local scan). */
export function detectProjectLanguage(dir: string): Language {
  const counts = new Map<Language, number>()
  let seen = 0

  const walk = (d: string): void => {
    if (seen >= MAX_FILES) return
    let entries: string[]
    try {
      entries = readdirSync(d)
    } catch {
      return
    }
    for (const name of entries) {
      if (seen >= MAX_FILES) return
      if (name.startsWith('.') && name !== '.') continue
      if (SKIP_DIRS.has(name)) continue
      const full = join(d, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        walk(full)
      } else {
        const lang = languageFromExtension(name)
        if (lang) {
          counts.set(lang, (counts.get(lang) ?? 0) + 1)
          seen++
        }
      }
    }
  }

  walk(dir)

  let best: Language = 'unknown'
  let bestCount = 0
  for (const [lang, count] of counts) {
    if (count > bestCount) {
      best = lang
      bestCount = count
    }
  }
  return best
}
