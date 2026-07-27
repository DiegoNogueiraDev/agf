/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * detect-scope-creep — "done with a leaked scope" is today only avoided
 * because the agent remembers to check. This codifies it: a task's own
 * testFiles/implementationFiles are its declared blast radius; any OTHER
 * modified file at `agf done` time is scope creep — either an accidental
 * edit or an undeclared dependency the task's contract never named.
 *
 * Mirrors detect-phantom-done.ts's shape (a pure, injectable-port detector);
 * the enforcement gate lives in done-cmd.ts (BLAST_RADIUS_EXCEEDED),
 * consuming the same modifiedFiles list `agf done` already captures for its
 * NO_FILES_MODIFIED check (DRY — one `git diff`, not two).
 */

import { minimatch } from 'minimatch'
import { DEFAULT_DECLARATIVE_WHITELIST } from '../planner/tdd-enforcement.js'
import { declaredFilesOf } from '../planner/next-task.js'
import type { GraphNode } from '../graph/graph-types.js'

/** Injectable git-diff probe: modified files relative to `dir` (mirrors FileExistsPort). */
export type GitModifiedFilesPort = (dir: string) => string[]

/** Declarative/generated/lock files that never count as scope creep even when touched incidentally. */
export const DEFAULT_SCOPE_ALLOWLIST: string[] = [
  ...DEFAULT_DECLARATIVE_WHITELIST,
  'dist/**',
  'build/**',
  '**/*.lock',
  'package-lock.json',
]

/**
 * Files modified beyond what the task declared and the allowlist excuses —
 * `modifiedFiles \ (declaredFiles ∪ allowlist)`.
 */
export function detectScopeCreep(
  modifiedFiles: readonly string[],
  declaredFiles: readonly string[],
  allowlist: readonly string[] = DEFAULT_SCOPE_ALLOWLIST,
): string[] {
  const declared = new Set(declaredFiles)
  return modifiedFiles.filter(
    (f) => !declared.has(f) && !allowlist.some((pattern) => minimatch(f, pattern, { dot: true })),
  )
}

/**
 * node_58932e8189fc — fronteira alheia num working tree compartilhado: os
 * arquivos declarados ({@link declaredFilesOf}) das OUTRAS tasks in_progress.
 * O gate do `agf done` os une ao allowlist para não acusar como scope creep o
 * trabalho em voo de outra formiga; um arquivo sujo sem dono declarado continua
 * sendo acusado — o gate reconhece fronteiras, não afrouxa.
 */
export function collectForeignInFlightFiles(nodes: readonly GraphNode[], closingNodeId: string): string[] {
  const files = new Set<string>()
  for (const node of nodes) {
    if (node.status !== 'in_progress' || node.id === closingNodeId) continue
    for (const f of declaredFilesOf(node)) files.add(f)
  }
  return [...files]
}
