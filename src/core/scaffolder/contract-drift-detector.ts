/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Contract Drift Detector — semantic comparison between graph-node contract spec and code.
 *
 * Compares the method signatures declared in a contract/interface graph node (graph side)
 * against the signatures extracted from the actual implementation (code side).
 *
 * Drift types:
 *   added_in_code     — method in code, not in graph (graph is "behind")
 *   removed_from_code — method in graph, not in code (code is "behind" — critical)
 *   signature_changed — method in both but signatures differ
 *
 * Critical drift = any removed_from_code change.
 * In strict mode + IMPLEMENT phase, critical drift blocks finish_task via DriftBlockedError.
 */

import { McpGraphError } from '../utils/errors.js'

// ── Types ──────────────────────────────────────────────────────────────────

export interface ContractSignature {
  /** method name → signature string, e.g. "(id: string) => User" */
  readonly methods: Record<string, string>
}

export type DriftChangeType = 'added_in_code' | 'removed_from_code' | 'signature_changed'
export type DivergentSide = 'code-behind' | 'graph-behind' | 'both'

export interface DriftChange {
  readonly method: string
  readonly type: DriftChangeType
  readonly divergentSide: DivergentSide
  /** Present when type is "signature_changed" */
  readonly graphSignature?: string
  readonly codeSignature?: string
}

export interface DriftReport {
  readonly contractName: string
  readonly hasDrift: boolean
  readonly critical: boolean
  readonly changes: readonly DriftChange[]
}

export interface DriftGateOptions {
  readonly mode: 'strict' | 'advisory'
  readonly phase: string
}

// ── Typed error ────────────────────────────────────────────────────────────

export class DriftBlockedError extends McpGraphError {
  constructor(contractName: string, changedMethods: string[]) {
    super(
      `finish_task blocked: critical drift detected in contract '${contractName}'. ` +
        `Method(s) [${changedMethods.join(', ')}] are declared in the graph but missing from code. ` +
        `Sync the contract node with the current implementation before proceeding.`,
    )
    this.name = 'DriftBlockedError'
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Compare graph-declared contract signatures against code-extracted signatures.
 * Returns a structured drift report with per-method changes.
 */
export function detectContractDrift(
  contractName: string,
  graphSig: ContractSignature,
  codeSig: ContractSignature,
): DriftReport {
  const changes: DriftChange[] = []

  const graphMethods = new Set(Object.keys(graphSig.methods))
  const codeMethods = new Set(Object.keys(codeSig.methods))

  // Methods in graph but not in code → code is behind (critical)
  for (const method of graphMethods) {
    if (!codeMethods.has(method)) {
      changes.push({
        method,
        type: 'removed_from_code',
        divergentSide: 'code-behind',
        graphSignature: graphSig.methods[method],
      })
    } else {
      const gSig = graphSig.methods[method]
      const cSig = codeSig.methods[method]
      if (gSig !== cSig) {
        changes.push({
          method,
          type: 'signature_changed',
          divergentSide: 'both',
          graphSignature: gSig,
          codeSignature: cSig,
        })
      }
    }
  }

  // Methods in code but not in graph → graph is behind (non-critical)
  for (const method of codeMethods) {
    if (!graphMethods.has(method)) {
      changes.push({
        method,
        type: 'added_in_code',
        divergentSide: 'graph-behind',
        codeSignature: codeSig.methods[method],
      })
    }
  }

  const critical = changes.some((c) => c.type === 'removed_from_code')

  return {
    contractName,
    hasDrift: changes.length > 0,
    critical,
    changes,
  }
}

/**
 * Gate check before finish_task.
 * Throws DriftBlockedError when critical drift is detected in strict+IMPLEMENT mode.
 */
export function assertNoDrift(report: DriftReport, options: DriftGateOptions): void {
  if (report.critical && options.mode === 'strict' && options.phase === 'IMPLEMENT') {
    const criticalMethods = report.changes.filter((c) => c.type === 'removed_from_code').map((c) => c.method)
    throw new DriftBlockedError(report.contractName, criticalMethods)
  }
}
