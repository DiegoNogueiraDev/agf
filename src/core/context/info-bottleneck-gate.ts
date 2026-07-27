/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Shared wiring for the Information-Bottleneck gate on context packing.
 *
 * WHY this small module exists: both context packers — `buildCompressedContext`
 * (compact-context.ts) and `applyFlowToCompact` (flow-compact.ts) — need the same
 * two things to gate a lossy compression: (1) the *predictive text* a task's
 * signal lives in, and (2) a safe read of the opt-in `info_bottleneck` lever.
 * Centralizing both keeps the two call sites DRY and guarantees identical gating.
 *
 * The lever resolver defaults to OFF whenever the store cannot supply project
 * settings (partial test mocks, no active project) — so the gate is a byte-
 * identical no-op unless explicitly enabled (the zero-regression contract).
 * §ADR-deterministic-first — pure, no I/O beyond the injected settings read.
 */

import type { EconomyLeversConfigSource } from '../economy/economy-levers-config.js'
import { resolveEconomyLeversConfig, isLeverEnabled, getLeverParam } from '../economy/economy-levers-config.js'
import { DEFAULT_BETA } from '../economy/info-bottleneck.js'

/** Resolved state of the info_bottleneck lever for one store. */
export interface InfoBottleneckGate {
  on: boolean
  beta: number
}

/** Minimal structural shape carrying a task's predictive text (TaskContext satisfies it). */
export interface PredictiveTextSource {
  task: { description?: string | null }
  acceptanceCriteria: string[]
}

/**
 * The task-predictive text the IB gate protects from lossy compression:
 * the task description plus its acceptance criteria — where the signal-bearing
 * keywords (identifiers, AC terms) live.
 */
export function taskPredictiveText(ctx: PredictiveTextSource): string {
  const parts: string[] = []
  if (ctx.task.description) parts.push(ctx.task.description)
  parts.push(...ctx.acceptanceCriteria)
  return parts.join('\n')
}

/**
 * Resolve the info_bottleneck lever for a store. Defaults to OFF (β = default)
 * when the store cannot supply project settings, so callers stay regression-safe.
 */
export function resolveInfoBottleneckGate(store: unknown): InfoBottleneckGate {
  const src = store as Partial<EconomyLeversConfigSource>
  if (typeof src.getProjectSetting !== 'function') return { on: false, beta: DEFAULT_BETA }
  const cfg = resolveEconomyLeversConfig(src as EconomyLeversConfigSource)
  return {
    on: isLeverEnabled(cfg, 'info_bottleneck'),
    beta: getLeverParam(cfg, 'info_bottleneck', 'beta', DEFAULT_BETA),
  }
}
