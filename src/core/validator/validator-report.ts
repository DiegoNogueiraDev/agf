/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * validator-report — composes the validator/ graph-integrity checkers into one
 * compact, report-only block for surface consumers (currently `agf check`).
 *
 * WHY: status-flow / done-integrity / edge-consistency checkers were built but
 * no surface ran them — dormant capability (golden rule 9). This is the wiring
 * point that makes them reachable. It is REPORT-ONLY by contract: callers must
 * NOT let `hasFindings` fail a gate. Promoting any of these to blocking is a
 * separate, explicit decision.
 *
 * Composes: done-integrity-checker, status-flow-checker, edge-consistency-checker.
 * Consumed by: src/cli/commands/check-cmd.ts (via the validator/index.ts barrel).
 */

import type { GraphDocument } from '../graph/graph-types.js'
import { checkDoneIntegrity } from './done-integrity-checker.js'
import { checkStatusFlow } from './status-flow-checker.js'
import { checkEdgeConsistency } from './edge-consistency-checker.js'

/** Compact, report-only summary of the validator graph-integrity checkers. */
export interface ValidatorReport {
  statusFlow: { complianceRate: number; violations: number }
  doneIntegrity: { passed: boolean; issues: number }
  edgeConsistency: { passed: boolean; issues: number }
  /** True when any checker surfaced at least one finding. Diagnostic only — never gates. */
  hasFindings: boolean
}

/** Run the validator graph-integrity checkers and fold them into one report block. */
export function buildValidatorReport(doc: GraphDocument): ValidatorReport {
  const flow = checkStatusFlow(doc)
  const integrity = checkDoneIntegrity(doc)
  const edges = checkEdgeConsistency(doc)

  const hasFindings = flow.violations.length > 0 || !integrity.passed || !edges.passed

  return {
    statusFlow: { complianceRate: flow.complianceRate, violations: flow.violations.length },
    doneIntegrity: { passed: integrity.passed, issues: integrity.issues.length },
    edgeConsistency: { passed: edges.passed, issues: edges.issues.length },
    hasFindings,
  }
}
