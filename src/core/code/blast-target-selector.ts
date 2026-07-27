/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

export type BlastTarget =
  { noOp: true } | { noOp: false; fallback: false; files: string[] } | { noOp: false; fallback: true }

/**
 * Decides what `agf test --blast` should run given the changed files and
 * the resolved test files from the code index.
 *
 * - `noOp: true`  → nothing changed; skip vitest entirely (fast path)
 * - `fallback: false` → run exactly the listed test files
 * - `fallback: true`  → code index empty; fall back to vitest --changed HEAD
 */
export function selectBlastTarget(
  changedFiles: readonly string[],
  resolvedTestFiles: ReadonlySet<string>,
): BlastTarget {
  if (changedFiles.length === 0) {
    return { noOp: true }
  }

  if (resolvedTestFiles.size === 0) {
    return { noOp: false, fallback: true }
  }

  return { noOp: false, fallback: false, files: [...resolvedTestFiles] }
}
