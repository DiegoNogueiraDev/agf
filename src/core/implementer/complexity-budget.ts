/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Complexity Budget — DoD heuristic for Karpathy principle 2 (Simplicity First).
 *
 * Two structural signals (no AST, no Code Intelligence):
 *  1. Any single new file exceeds 200 LOC and the node was not decomposed
 *     into subtasks — suggests a unit that should have been split.
 *  2. Implementation:test LOC ratio exceeds 5:1 — suggests untested complexity.
 *
 * Files that don't exist on disk are skipped gracefully (deleted, renamed,
 * future-tense paths). Empty inputs return a passing N/A result.
 */

import { existsSync, readFileSync } from 'node:fs'

const FILE_LOC_LIMIT = 200
const MAX_IMPL_TEST_RATIO = 5

export interface ComplexityBudgetInput {
  implementationFiles: string[]
  testFiles: string[]
  hasChildren: boolean
}

export type ViolationKind = 'file_too_large' | 'test_ratio_low'

export interface ComplexityViolation {
  kind: ViolationKind
  file?: string
  loc?: number
  ratio?: number
}

export interface ComplexityBudgetResult {
  passed: boolean
  details: string
  violations: ComplexityViolation[]
  filesScanned: number
}

/** Count non-empty lines in a file. Returns null if the file does not exist. */
function countLoc(filePath: string): number | null {
  if (!existsSync(filePath)) return null
  try {
    const text = readFileSync(filePath, 'utf8')
    return text.split('\n').filter((l) => l.trim().length > 0).length
  } catch {
    return null
  }
}

/** Evaluate complexity budget heuristics for a task's implementation files. */
export function evaluateComplexityBudget(input: ComplexityBudgetInput): ComplexityBudgetResult {
  const violations: ComplexityViolation[] = []

  if (input.implementationFiles.length === 0) {
    return {
      passed: true,
      details: 'Sem arquivos de implementação declarados — N/A',
      violations: [],
      filesScanned: 0,
    }
  }

  let implTotal = 0
  let filesScanned = 0
  for (const file of input.implementationFiles) {
    const loc = countLoc(file)
    if (loc === null) continue
    filesScanned++
    implTotal += loc

    if (loc > FILE_LOC_LIMIT && !input.hasChildren) {
      violations.push({ kind: 'file_too_large', file, loc })
    }
  }

  if (filesScanned === 0) {
    return {
      passed: true,
      details: '0 files found on disk — skip (paths may be future-tense or moved)',
      violations: [],
      filesScanned: 0,
    }
  }

  let testTotal = 0
  for (const file of input.testFiles) {
    const loc = countLoc(file)
    if (loc !== null) testTotal += loc
  }

  if (testTotal > 0 && implTotal / testTotal > MAX_IMPL_TEST_RATIO) {
    const ratio = Number((implTotal / testTotal).toFixed(2))
    violations.push({ kind: 'test_ratio_low', ratio })
  }

  const passed = violations.length === 0
  const details = passed
    ? `Complexity ok: ${filesScanned} file(s), ${implTotal} impl LOC, ${testTotal} test LOC`
    : describeViolations(violations)

  return { passed, details, violations, filesScanned }
}

function describeViolations(violations: ComplexityViolation[]): string {
  return violations
    .map((v) => {
      if (v.kind === 'file_too_large')
        return `${v.file} has ${v.loc} LOC (> ${FILE_LOC_LIMIT}) and node has no subtasks`
      if (v.kind === 'test_ratio_low') return `impl:test LOC ratio = ${v.ratio}:1 (limit ${MAX_IMPL_TEST_RATIO}:1)`
      return ''
    })
    .filter(Boolean)
    .join('; ')
}
