/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_cdf502b8b153 AC coverage: Recovery Verification
 *
 * AC1: After applyRecovery, run build check (tsc --noEmit) for code actions
 * AC2: If build fails, return failed outcome (rollback is caller's responsibility)
 * AC3: Record verification outcome (passed/failed/skipped) in result
 * AC4: Skip build check for non-code actions (flag_for_review, update_status, etc.)
 * AC5: Optional file-level test check (testable via injected checker)
 */

import { describe, it, expect, vi } from 'vitest'
import type { HealingAction } from '../schemas/healing.schema.js'
import { isCodeAction, verifyRecovery, type VerificationResult } from '../core/skills/recovery-verification.js'

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeAction(type: HealingAction['type'], nodeId = 'node-1'): HealingAction {
  return { id: `act-1`, issueId: `iss-1`, type, nodeId, description: 'test action' }
}

// ── AC4: Non-code actions are always skipped ──────────────────────────────────

describe('AC4: isCodeAction — non-code action types return false', () => {
  it('flag_for_review is not a code action', () => {
    expect(isCodeAction('flag_for_review')).toBe(false)
  })

  it('update_status is not a code action', () => {
    expect(isCodeAction('update_status')).toBe(false)
  })

  it('remove_edge is not a code action', () => {
    expect(isCodeAction('remove_edge')).toBe(false)
  })

  it('clear_blocked is not a code action', () => {
    expect(isCodeAction('clear_blocked')).toBe(false)
  })

  it('add_flag is not a code action', () => {
    expect(isCodeAction('add_flag')).toBe(false)
  })
})

describe('AC4: verifyRecovery returns skipped for all current non-code action types', () => {
  const nonCodeTypes: HealingAction['type'][] = [
    'flag_for_review',
    'update_status',
    'remove_edge',
    'clear_blocked',
    'add_flag',
  ]

  for (const actionType of nonCodeTypes) {
    it(`${actionType} → outcome: skipped (no build check)`, () => {
      const action = makeAction(actionType)
      const result = verifyRecovery(action, '/tmp')
      expect(result.outcome).toBe('skipped')
      expect(result.durationMs).toBe(0)
    })
  }
})

// ── AC1: Code actions trigger a build check ───────────────────────────────────

describe('AC1: verifyRecovery — build check runs for code actions (injected checker)', () => {
  it('calls buildChecker when action isCodeAction = true', () => {
    const mockChecker = vi.fn().mockReturnValue({ success: true, errorMessage: undefined })
    const action: HealingAction = {
      id: 'act-code',
      issueId: 'iss-code',
      type: 'update_status', // will force via forceCodeAction
      nodeId: 'node-x',
      description: 'code fix',
    }

    // Pass custom isCode override to test the build-check path
    const result = verifyRecovery(action, '/tmp', { buildChecker: mockChecker, forceCodeAction: true })
    expect(mockChecker).toHaveBeenCalledOnce()
    expect(result.outcome).toBe('passed')
    store_close_if_any()
  })
})

// ── AC2: Build failure returns failed outcome ─────────────────────────────────

describe('AC2: verifyRecovery — failed build returns outcome:failed', () => {
  it('outcome is failed when buildChecker returns success=false', () => {
    const mockChecker = vi.fn().mockReturnValue({
      success: false,
      errorMessage: 'Type error: cannot assign void to string',
    })
    const action = makeAction('update_status')
    const result = verifyRecovery(action, '/tmp', {
      buildChecker: mockChecker,
      forceCodeAction: true,
    })
    expect(result.outcome).toBe('failed')
    expect(result.errorMessage).toContain('Type error')
  })

  it('errorMessage is included in failed result', () => {
    const mockChecker = vi.fn().mockReturnValue({ success: false, errorMessage: 'TS2345 error' })
    const action = makeAction('update_status')
    const result = verifyRecovery(action, '/tmp', {
      buildChecker: mockChecker,
      forceCodeAction: true,
    })
    expect(typeof result.errorMessage).toBe('string')
    expect((result.errorMessage?.length ?? 0) > 0).toBe(true)
  })
})

// ── AC3: VerificationResult shape ────────────────────────────────────────────

describe('AC3: VerificationResult — structured outcome with durationMs', () => {
  it('result has outcome, durationMs fields', () => {
    const action = makeAction('flag_for_review')
    const result: VerificationResult = verifyRecovery(action, '/tmp')
    expect(typeof result.outcome).toBe('string')
    expect(['passed', 'failed', 'skipped']).toContain(result.outcome)
    expect(typeof result.durationMs).toBe('number')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('skipped result has no errorMessage', () => {
    const action = makeAction('flag_for_review')
    const result = verifyRecovery(action, '/tmp')
    expect(result.errorMessage).toBeUndefined()
  })

  it('passed result has no errorMessage', () => {
    const mockChecker = vi.fn().mockReturnValue({ success: true })
    const action = makeAction('update_status')
    const result = verifyRecovery(action, '/tmp', {
      buildChecker: mockChecker,
      forceCodeAction: true,
    })
    expect(result.errorMessage).toBeUndefined()
  })
})

// helper: some tests may open stores, handle cleanup gracefully
function store_close_if_any() {
  /* no-op: no store in this test module */
}
