/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Lifecycle facade orchestrator — fans out analyze() modes for a given phase
 * via Promise.all and aggregates outputs into a single report. Used by the
 * `graph_lifecycle` MCP tool (Task 3.2). Pure function: takes an injected
 * `invokeMode` so it can be unit-tested without an McpServer.
 */

import { getModesForPhase, type LifecyclePhase } from './lifecycle-phase.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'planner/lifecycle-facade.ts' })

export type ModeOutput = { ok: true; payload: Record<string, unknown> } | { ok: false; error: string }

export type ModeInvoker = (mode: string) => Promise<ModeOutput>

export type FacadeWarningCode = 'no_modes_for_phase' | 'mode_failed' | 'mode_unknown'

export interface FacadeWarning {
  code: FacadeWarningCode
  message: string
  mode?: string
}

export interface LifecycleFacadeReport {
  ok: boolean
  phase: LifecyclePhase
  modes: string[]
  outputs: Record<string, Record<string, unknown>>
  errors: Record<string, string>
  warnings: FacadeWarning[]
}

/**
 * Run all analyze() modes for `phase` in parallel, aggregating outputs.
 *
 * @param invokeMode — function invoked once per mode; returns the parsed
 *   `analyze` payload (without the MCP `content` wrapper) on success.
 * @param phase — lifecycle phase whose modes should be fanned out.
 * @param subCheck — optional mode name; when provided, only that mode runs.
 *   If `subCheck` is not in the phase's mode list, no modes run and a
 *   `mode_unknown` warning is emitted.
 *
 * `ok` is `false` only when at least one mode invocation returned an error.
 * Phases without any mapped modes return `ok: true` with a
 * `no_modes_for_phase` warning so the caller surface stays predictable.
 */
export async function runLifecycleFacade(
  invokeMode: ModeInvoker,
  phase: LifecyclePhase,
  subCheck?: string,
): Promise<LifecycleFacadeReport> {
  log.debug('lifecycle-facade:runLifecycleFacade', {})
  const phaseModes = getModesForPhase(phase)
  const warnings: FacadeWarning[] = []

  if (phaseModes.length === 0) {
    warnings.push({
      code: 'no_modes_for_phase',
      message: `No analyze() modes mapped for phase '${phase}'`,
    })
    return { ok: true, phase, modes: [], outputs: {}, errors: {}, warnings }
  }

  let modesToRun = phaseModes
  if (subCheck !== undefined) {
    if (!phaseModes.includes(subCheck)) {
      warnings.push({
        code: 'mode_unknown',
        message: `subCheck '${subCheck}' is not a valid mode for phase '${phase}'`,
        mode: subCheck,
      })
      return { ok: true, phase, modes: [], outputs: {}, errors: {}, warnings }
    }
    modesToRun = [subCheck]
  }

  const settled = await Promise.all(modesToRun.map(async (mode) => ({ mode, result: await invokeMode(mode) })))

  const outputs: Record<string, Record<string, unknown>> = {}
  const errors: Record<string, string> = {}

  for (const { mode, result } of settled) {
    if (result.ok) {
      // Strip redundant `ok` and `mode` fields — `ok` is implicit (we got a
      // payload), and `mode` is already the key in `outputs`. Saves ~20
      // chars per mode and keeps the AC2 token budget under +10%.
      const stripped: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(result.payload)) {
        if (k === 'ok' || k === 'mode') continue
        stripped[k] = v
      }
      outputs[mode] = stripped
    } else {
      errors[mode] = result.error
      warnings.push({
        code: 'mode_failed',
        message: `Mode '${mode}' failed: ${result.error}`,
        mode,
      })
    }
  }

  const ok = Object.keys(errors).length === 0
  return { ok, phase, modes: modesToRun, outputs, errors, warnings }
}
