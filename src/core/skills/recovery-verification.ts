/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Recovery Verification — post-apply build check for code-modifying healing actions.
 *
 * All current action types (update_status, remove_edge, add_flag, clear_blocked,
 * flag_for_review) are graph mutations, not file edits — they are classified as
 * non-code actions and skip the build check (AC4). This module is designed to be
 * extended when code-modifying action types are added to the healing schema.
 *
 * AC1: Code actions → run tsc --noEmit (or injected buildChecker)
 * AC2: Build fail → outcome:'failed' + errorMessage
 * AC3: Result carries outcome | durationMs | errorMessage?
 * AC4: Non-code actions → outcome:'skipped', durationMs:0
 */

import { spawnSync } from 'node:child_process'
import type { HealingActionType, HealingAction } from '../../schemas/healing.schema.js'

export type VerificationOutcome = 'passed' | 'failed' | 'skipped'

export interface VerificationResult {
  outcome: VerificationOutcome
  durationMs: number
  errorMessage?: string
}

export interface BuildCheckResult {
  success: boolean
  errorMessage?: string
}

export type BuildChecker = (dir: string) => BuildCheckResult

export interface VerifyRecoveryOptions {
  buildChecker?: BuildChecker
  forceCodeAction?: boolean
}

/** Action types that modify source files and therefore require a build check. */
const CODE_ACTION_TYPES = new Set<HealingActionType>([
  // All current types are graph mutations — no code-file modifications.
  // Add types here as the healing schema expands (e.g. 'apply_code_fix').
])

/** Return true when the healing action type involves writing or modifying source code. */
export function isCodeAction(type: HealingActionType): boolean {
  return CODE_ACTION_TYPES.has(type)
}

/**
 * Verifies that a recovery action did not break the build.
 *
 * - Non-code actions (all current types): returns {outcome:'skipped', durationMs:0}.
 * - Code actions: runs the buildChecker and returns passed/failed with durationMs.
 *
 * Rollback on failure is the responsibility of the caller — this function only
 * reports the outcome. The build check is injectable so tests can mock it without
 * spawning a real TypeScript compiler.
 */
export function verifyRecovery(
  action: HealingAction,
  dir: string,
  opts: VerifyRecoveryOptions = {},
): VerificationResult {
  const { buildChecker, forceCodeAction = false } = opts

  if (!forceCodeAction && !isCodeAction(action.type)) {
    return { outcome: 'skipped', durationMs: 0 }
  }

  const checker: BuildChecker = buildChecker ?? defaultBuildChecker
  const start = Date.now()
  const check = checker(dir)
  const durationMs = Date.now() - start

  if (!check.success) {
    return {
      outcome: 'failed',
      durationMs,
      errorMessage: check.errorMessage,
    }
  }

  return { outcome: 'passed', durationMs }
}

/** Default build checker: runs `npx tsc --noEmit --skipLibCheck` in the given directory. */
function defaultBuildChecker(dir: string): BuildCheckResult {
  const result = spawnSync('npx', ['tsc', '--noEmit', '--skipLibCheck'], {
    cwd: dir,
    encoding: 'utf-8',
    timeout: 60_000,
  })
  if (result.status !== 0) {
    const stderr = (result.stderr as string | null) ?? ''
    return { success: false, errorMessage: stderr.slice(0, 500) }
  }
  return { success: true }
}
