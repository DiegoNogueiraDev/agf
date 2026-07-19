/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Surgical Scope — DoD heuristic for Karpathy principle 3 (Surgical Changes).
 *
 * Compares files actually modified during a task against the scope the task
 * declared up-front. Flags scope creep — when more than `thresholdRatio` of
 * the modified files fall outside the declared list. Skips gracefully when
 * either list is empty (cannot infer scope creep without both signals).
 */

import { isAbsolute, relative } from 'node:path'

const DEFAULT_THRESHOLD_RATIO = 0.3

export interface SurgicalScopeInput {
  declaredFiles: string[]
  modifiedFiles: string[]
  cwd?: string
  thresholdRatio?: number
}

export interface SurgicalScopeResult {
  passed: boolean
  skipped: boolean
  details: string
  outOfScopeRatio: number
  outOfScopeFiles: string[]
}

/** Normalize a path to a repo-relative POSIX form for set comparison. */
function normalize(path: string, cwd: string): string {
  const rel = isAbsolute(path) ? relative(cwd, path) : path
  return rel.replace(/\\/g, '/')
}

export function evaluateSurgicalScope(input: SurgicalScopeInput): SurgicalScopeResult {
  const cwd = input.cwd ?? process.cwd()
  const threshold = input.thresholdRatio ?? DEFAULT_THRESHOLD_RATIO

  if (input.declaredFiles.length === 0) {
    return {
      passed: true,
      skipped: true,
      details: 'No declared scope on node — skip (avoid false positive)',
      outOfScopeRatio: 0,
      outOfScopeFiles: [],
    }
  }

  if (input.modifiedFiles.length === 0) {
    return {
      passed: true,
      skipped: true,
      details: 'No modified files reported — nothing to compare',
      outOfScopeRatio: 0,
      outOfScopeFiles: [],
    }
  }

  const declaredSet = new Set(input.declaredFiles.map((p) => normalize(p, cwd)))
  const outOfScopeFiles = input.modifiedFiles.filter((m) => !declaredSet.has(normalize(m, cwd)))
  const ratio = outOfScopeFiles.length / input.modifiedFiles.length
  const passed = ratio <= threshold

  const details = passed
    ? `${input.modifiedFiles.length} file(s) modified, ${(ratio * 100).toFixed(0)}% out of declared scope (limit ${(threshold * 100).toFixed(0)}%)`
    : `Scope creep: ${outOfScopeFiles.length}/${input.modifiedFiles.length} (${(ratio * 100).toFixed(0)}%) modified files outside declared scope — exceeds ${(threshold * 100).toFixed(0)}% limit`

  return {
    passed,
    skipped: false,
    details,
    outOfScopeRatio: Number(ratio.toFixed(4)),
    outOfScopeFiles,
  }
}
