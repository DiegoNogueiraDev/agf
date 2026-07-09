/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type { CodeStore } from './code-store.js'
import { getBlastRadiusTestFiles } from './blast-radius.js'

/**
 * Returns the set of test file paths that are transitively affected by the
 * given changed source files, using the CodeStore symbol+relation graph.
 *
 * Returns an empty Set when:
 * - `changedFiles` is empty
 * - The code index is not yet populated (no symbols for the project)
 *
 * Callers should fall back to vitest `--changed HEAD` when the result is empty.
 */
export function resolveBlastTestFiles(
  codeStore: CodeStore,
  projectId: string,
  changedFiles: readonly string[],
): Set<string> {
  if (changedFiles.length === 0) return new Set()

  const symbols = codeStore.getAllSymbols(projectId)
  if (symbols.length === 0) return new Set()

  const relations = codeStore.getAllRelations(projectId)
  return getBlastRadiusTestFiles(symbols, relations, changedFiles)
}
