/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Citation Validator — for files in `src/core/`, requires at least one
 * `§EPIC-...` style citation linking the implementation to a spec or ADR.
 * Files outside `src/core/` are ignored (CLI, tests, schemas, web, etc.).
 */

import { hasCitation } from './citation-extractor.js'

export interface CitationFile {
  path: string
  content: string
}

export interface CitationViolation {
  path: string
  reason: string
}

export interface CitationValidationResult {
  violations: CitationViolation[]
  checkedCount: number
}

const CORE_PATH_RE = /(^|\/)src\/core\//

/** isCorePath —  */
export function isCorePath(path: string): boolean {
  return CORE_PATH_RE.test(path)
}

/** validateFilesCitations —  */
export function validateFilesCitations(files: CitationFile[]): CitationValidationResult {
  const violations: CitationViolation[] = []
  let checkedCount = 0

  for (const file of files) {
    if (!isCorePath(file.path)) continue
    checkedCount++
    if (!hasCitation(file.content)) {
      violations.push({
        path: file.path,
        reason: 'core file has no §EPIC/§ADR citation — add one to anchor implementation to spec',
      })
    }
  }

  return { violations, checkedCount }
}
