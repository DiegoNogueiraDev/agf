/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC Unified Hook Surface (Task 2.4) — dispatch dos hooks de finalização.
 * Cobre on_circuit_break (storeless → HookBus compartilhado). Os outros pontos
 * de finalização reusam canais já emitidos pelo store-bus em task-lifecycle.ts:
 *   - pre_task_done  → 'task:pre-done'      (emitTaskHookSync no finishTask)
 *   - post_task_done → 'task:post-complete' (já emitido — reuso)
 *   - on_task_fail   → 'task:error'         (já emitido — reuso)
 * Guardado por AGF_HOOKS=0; emitSync isola erros de handler (byte-identical).
 */

import { getSharedHookBus } from './shared-hook-bus.js'
import { hooksDisabled } from './hook-runtime.js'
import {
  checkConnectivityRegression,
  isConnectivityGuardDisabled,
  type ConnectivityRegressionInput,
} from './connectivity-regression-guard.js'
import {
  checkSpectraRegression,
  isSpectraGateDisabled,
  type SpectraRegressionInput,
} from './spectra-regression-gate.js'

/** Payload de um circuit-break — escopo + contadores. */
export interface CircuitBreakPayload {
  scope?: string
  [key: string]: unknown
}

/**
 * Emits a connectivity-regression warning when a done task introduced new dormant
 * capabilities. No-op when hooks are disabled (AGF_HOOKS=0) or the guard is
 * disabled (AGF_CONNECTIVITY_GUARD=0). Never throws to the caller.
 */
export function emitConnectivityRegressionHook(input: Omit<ConnectivityRegressionInput, 'disabled'>): void {
  if (hooksDisabled()) return
  const disabled = isConnectivityGuardDisabled()
  const result = checkConnectivityRegression({ ...input, disabled })
  if (result.skipped || !result.regression) return
  getSharedHookBus().emitSync({
    channel: 'connectivity:regression',
    timestamp: new Date().toISOString(),
    payload: {
      newDormant: result.newDormant,
      addedFiles: result.addedFiles ?? [],
    },
  })
}

/**
 * Emits a spectra-regression warning when a done task caused any behaviour
 * spectrum to drop beyond the configured delta. No-op when hooks or the gate
 * are disabled. Never throws to the caller.
 */
export function emitSpectraRegressionHook(input: Omit<SpectraRegressionInput, 'disabled'>): void {
  if (hooksDisabled()) return
  const disabled = isSpectraGateDisabled()
  const result = checkSpectraRegression({ ...input, disabled })
  if (result.skipped || !result.regression) return
  getSharedHookBus().emitSync({
    channel: 'spectra:regression',
    timestamp: new Date().toISOString(),
    payload: { regressedSpectra: result.regressedSpectra },
  })
}

/**
 * Emite on_circuit_break (canal `circuit:break`) no HookBus compartilhado.
 * No-op se os hooks estão desabilitados (AGF_HOOKS=0). Nunca lança ao caller.
 */
export function emitCircuitBreakHook(payload: CircuitBreakPayload): void {
  if (hooksDisabled()) return
  getSharedHookBus().emitSync({
    channel: 'circuit:break',
    timestamp: new Date().toISOString(),
    payload,
  })
}
