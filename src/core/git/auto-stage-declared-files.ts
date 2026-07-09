/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * auto-stage-declared-files — `agf done`'s NO_FILES_MODIFIED gate checks
 * `git diff --name-only HEAD`, which does not see a brand-new file until it
 * is staged. A task can correctly declare testFiles/implementationFiles that
 * are real, on-disk, and just never `git add`'d — the gate saw that as "no
 * files modified" instead of the actual problem (untracked, not unmodified).
 *
 * This attempts `git add` on every declared file that shows up as untracked
 * in `git status --porcelain`, so a legitimately-declared file gets staged
 * instead of silently tripping the gate. Files that are gitignored (or
 * otherwise fail to stage) are reported so the caller can emit a clear error
 * naming the exact file, instead of a generic NO_FILES_MODIFIED.
 */
import { spawnSync } from 'node:child_process'

export interface AutoStageResult {
  /** Declared files that were untracked and successfully `git add`'d. */
  staged: string[]
  /** Declared files that were untracked but failed to stage (e.g. gitignored). */
  failed: Array<{ file: string; error: string }>
}

/**
 * Attempt to `git add` every declared file that isn't already a tracked,
 * dirty (modified/staged) path in `dir`. Untouched, already-tracked files are
 * left alone (no-op) — only genuinely untracked files (or gitignored ones,
 * which `git status` reports as neither tracked nor untracked) get a
 * `git add` attempt, since either would otherwise silently trip the
 * NO_FILES_MODIFIED gate.
 */
export function autoStageDeclaredFiles(dir: string, declaredFiles: readonly string[]): AutoStageResult {
  if (declaredFiles.length === 0) return { staged: [], failed: [] }

  // Scope `git status` to exactly the declared paths: an unscoped `git status
  // --porcelain` collapses an entirely-untracked directory into a single
  // `?? dirname/` entry, which would hide an untracked file one level down
  // (e.g. `?? src/` instead of `?? src/new.ts`).
  const statusResult = spawnSync('git', ['status', '--porcelain', '--', ...declaredFiles], {
    cwd: dir,
    encoding: 'utf-8',
    timeout: 10_000,
  })

  // Files git status already lists as tracked-and-dirty (not `??`) will be
  // seen by the diff gate as-is — leave them alone entirely.
  const alreadyTrackedAndDirty = new Set<string>()
  for (const raw of (statusResult.stdout ?? '').split('\n')) {
    if (!raw.trim() || raw.slice(0, 2) === '??') continue
    alreadyTrackedAndDirty.add(raw.slice(3))
  }

  const staged: string[] = []
  const failed: Array<{ file: string; error: string }> = []

  for (const file of declaredFiles) {
    if (alreadyTrackedAndDirty.has(file)) continue

    const addResult = spawnSync('git', ['add', '--', file], { cwd: dir, encoding: 'utf-8', timeout: 10_000 })
    if (addResult.status === 0) {
      staged.push(file)
    } else {
      failed.push({ file, error: addResult.stderr?.trim() || 'git add failed' })
    }
  }

  return { staged, failed }
}
