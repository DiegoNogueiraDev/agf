/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-21.T01 — Citation coverage guard.
 * Pure: dado uma lista de {file, content}, identifica os arquivos em
 * src/core/ que não contêm ≥1 §CITATION. Caller (hook task:post-complete)
 * loga warning com a fileList.
 */

import { extractCitations } from '../citations/citation-extractor.js'

export interface FileContent {
  file: string
  content: string
}

export interface CoverageReport {
  missing: string[]
  scanned: number
  skipped: number
}

/** Files under these path prefixes are intentionally skipped (no citations expected). */
const SKIP_PREFIXES = ['src/tests/', 'src/cli/', 'src/web/', 'src/api/', 'tools/', 'docs/']

/** isCitationGuardDisabled —  */
export function isCitationGuardDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MCP_GRAPH_CITATION_GUARD === 'off'
}

function isCoreFile(path: string): boolean {
  if (!path.startsWith('src/core/')) return false
  for (const skip of SKIP_PREFIXES) {
    if (path.startsWith(skip)) return false
  }
  return path.endsWith('.ts')
}

/**
 * Scan the provided files and return the ones in src/core/ that lack citations.
 * Returns counts so the caller can decide log severity.
 */
export function checkCitationCoverage(files: FileContent[]): CoverageReport {
  const missing: string[] = []
  let scanned = 0
  let skipped = 0
  for (const fVar of files) {
    if (!isCoreFile(fVar.file)) {
      skipped++
      continue
    }
    scanned++
    if (extractCitations(fVar.content).length === 0) {
      missing.push(fVar.file)
    }
  }
  return { missing, scanned, skipped }
}
