/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * verify-ac — repeatedly found ACs already satisfied by existing code,
 * discovered only by manual grep before implementing from scratch. Checks,
 * in priority order:
 *   1. A `--check` hint attached to the node (node.metadata.checkHint) — run
 *      it, exit code decides.
 *   2. Declared testFiles — run the resolved test gate (same runner `agf
 *      done`/`agf check` use), pass/fail decides.
 *   3. Otherwise, if the AC is testable-in-principle (scoreAcTestability's
 *      hasObservableOutcome — has a real action verb, not just filler), grep
 *      the codebase for key terms extracted from the AC text. A match means
 *      the behavior likely already exists; no match means it doesn't.
 *   4. A vague AC with none of the above is 'unclear' — there's nothing to
 *      derive a check from, so no verdict can be given either way.
 */
import { spawnSync } from 'node:child_process'
import type { SqliteStore } from '../store/sqlite-store.js'
import { getNodeAcFromStore } from '../utils/ac-helpers.js'
import { scoreAcTestability, tokenize } from './ac-testability.js'
import { runResolvedTestGate } from '../runner/execute-test-gate.js'

export type AcVerificationStatus = 'satisfied' | 'not_satisfied' | 'unclear'

export interface AcVerificationResult {
  status: AcVerificationStatus
  reason: string
}

/** Minimum token length to count as a "key term" worth grepping for. */
const MIN_KEY_TERM_LENGTH = 4

function grepCodebaseForTerms(dir: string, terms: string[]): boolean {
  const candidates = terms.filter((t) => t.length >= MIN_KEY_TERM_LENGTH).slice(0, 5)
  if (candidates.length === 0) return false

  for (const term of candidates) {
    const result = spawnSync('grep', ['-ril', '--include=*.ts', '-e', term, join_src(dir)], {
      encoding: 'utf-8',
      timeout: 10_000,
    })
    if (result.status === 0 && (result.stdout ?? '').trim().length > 0) return true
  }
  return false
}

function join_src(dir: string): string {
  return `${dir}/src`
}

/** Verify whether a node's AC is already satisfied by existing code. `testCmd` overrides test-runner detection (mirrors `agf done --test-cmd`). */
export function verifyAc(store: SqliteStore, nodeId: string, dir: string, testCmd?: string): AcVerificationResult {
  const node = store.getNodeById(nodeId)
  if (!node) return { status: 'not_satisfied', reason: 'node not found' }

  const checkHint = (node.metadata as { checkHint?: string } | undefined)?.checkHint
  if (checkHint) {
    const result = spawnSync(checkHint, { shell: true, cwd: dir, encoding: 'utf-8', timeout: 10_000 })
    return result.status === 0
      ? { status: 'satisfied', reason: `check hint passed: ${checkHint}` }
      : { status: 'not_satisfied', reason: `check hint failed (exit ${result.status}): ${checkHint}` }
  }

  if (node.testFiles && node.testFiles.length > 0) {
    const gate = runResolvedTestGate(dir, node.testFiles, testCmd)
    return gate.passed
      ? { status: 'satisfied', reason: 'declared testFiles pass' }
      : { status: 'not_satisfied', reason: 'declared testFiles fail or no runner detected them' }
  }

  const acTexts = getNodeAcFromStore(store, nodeId)
  const acJoined = acTexts.join(' ')
  if (!acJoined.trim()) return { status: 'unclear', reason: 'no check hint and no testFiles (and no AC text)' }

  const scored = scoreAcTestability(acJoined)
  if (!scored.hasObservableOutcome) {
    return {
      status: 'unclear',
      reason: 'no check hint and no testFiles — AC has no observable outcome to derive a check from',
    }
  }

  const found = grepCodebaseForTerms(dir, tokenize(acJoined))
  return found
    ? { status: 'satisfied', reason: 'matching code found via grep on AC key terms' }
    : { status: 'not_satisfied', reason: 'no matching code found via grep on AC key terms' }
}
