/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §EPIC-13.4 — Out-of-Phase Advisory Wrapper used by analyze() modes
 * that are DESIGN-specific (traceability, coupling, interfaces,
 * tech_risk, design_ready). When called outside DESIGN, the result is
 * wrapped in an `advisory: true` envelope with a `phaseWarning`,
 * signalling the caller that the report should NOT trigger gate
 * enforcement.
 *
 * In DESIGN, the report is returned flat (spread at the top level) so
 * existing call sites that read fields directly continue to work.
 */

import type { LifecyclePhase } from '../planner/lifecycle-phase.js'

export interface AdvisoryWrapped<TMode extends string = string> {
  ok: true
  mode: TMode
  advisory?: true
  phaseWarning?: string
  /** Only present when `advisory` is true. */
  data?: unknown
  [key: string]: unknown
}

/** wrapDesignPhaseAdvisory —  */
export function wrapDesignPhaseAdvisory<TMode extends string>(
  phase: LifecyclePhase,
  mode: TMode,
  report: Record<string, unknown>,
): AdvisoryWrapped<TMode> {
  if (phase === 'DESIGN') {
    return { ok: true, mode, ...report }
  }
  return {
    ok: true,
    mode,
    advisory: true,
    phaseWarning: `Results from ${mode} are non-binding in phase ${phase} — run in DESIGN for gate enforcement`,
    data: report,
  }
}
