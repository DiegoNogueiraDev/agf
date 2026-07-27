/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Grants assembler — composes the existing permission enforcer
 * (src/core/permissions/enforcer.ts) and approval checker
 * (src/core/approval/approval-checker.ts) into one `Grant`. Pure, no I/O.
 */

import { enforce, type EnforceContext } from '../permissions/enforcer.js'
import { checkApproval, type ApprovalCheckInput } from '../approval/approval-checker.js'
import type { PermissionMode } from '../worker-state/worker-state-schema.js'
import type { Grant } from '../../schemas/session.schema.js'

/**
 * Assemble a single grant from a permission mode, an enforce context, and an
 * approval-check input. Maps the enforcer verdict + approval result onto the
 * `Grant` shape without duplicating either subsystem's logic.
 */
export function assembleGrant(
  mode: PermissionMode,
  enforceCtx: EnforceContext,
  approvalInput: ApprovalCheckInput,
): Grant {
  const verdict = enforce(mode, enforceCtx)
  const approval = checkApproval(approvalInput)
  return {
    capability: enforceCtx.capability,
    verdict: verdict.verdict,
    reason: verdict.verdict === 'deny' ? verdict.reason : '',
    approval,
  }
}
