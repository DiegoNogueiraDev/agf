/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-6.T08 — Complexity classifier (Tier 0/1/2 routing).
 *
 * Routes a task to one of three tiers based on:
 *   - taskKind  — what is being done (refactor / feature / migration / etc.)
 *   - tokenBudget — how many tokens fit in the context
 *   - criticality — low | medium | high (operator hint)
 *
 *   Tier 0 — pure regex/AST transform; no LLM call.
 *   Tier 1 — small/cheap LLM (Haiku-class).
 *   Tier 2 — strong LLM (Sonnet/Opus-class).
 *
 * Critical tools (security, migration, schema) ALWAYS go Tier 2 unless an
 * explicit override is set. Pure decision module.
 */

export type Tier = 'tier0' | 'tier1' | 'tier2'
export type Criticality = 'low' | 'medium' | 'high'

export type TaskKind =
  | 'typo-fix'
  | 'rename-symbol'
  | 'format-only'
  | 'extract-function'
  | 'add-test'
  | 'feature'
  | 'refactor'
  | 'migration'
  | 'security'
  | 'schema-change'
  | 'unknown'

const ALWAYS_TIER2: ReadonlySet<TaskKind> = new Set(['migration', 'security', 'schema-change'])

const ALWAYS_TIER0_KINDS: ReadonlySet<TaskKind> = new Set(['typo-fix', 'format-only', 'rename-symbol'])

export const SMALL_BUDGET_TOKENS = 4000
export const LARGE_BUDGET_TOKENS = 32_000

export interface ComplexityInput {
  taskKind: TaskKind
  tokenBudget?: number
  criticality?: Criticality
  /** Operator override: pin a tier regardless of heuristic. */
  override?: Tier
  /**
   * Lifecycle phase for phase-aware routing.
   * SHAPE (ANALYZE/DESIGN/PLAN) → tier2, BUILD (IMPLEMENT/VALIDATE) → tier1,
   * SHIP (REVIEW/HANDOFF) → tier1, DEPLOY → tier2, LISTENING → tier0.
   */
  phase?: string
}

export interface ComplexityDecision {
  tier: Tier
  reason: string
  override: boolean
}

/** classifyComplexity —  */
export function classifyComplexity(input: ComplexityInput): ComplexityDecision {
  if (input.override) {
    return { tier: input.override, reason: 'operator-override', override: true }
  }

  if (ALWAYS_TIER2.has(input.taskKind)) {
    return {
      tier: 'tier2',
      reason: `critical-task-kind:${input.taskKind}`,
      override: false,
    }
  }

  if (input.criticality === 'high') {
    return { tier: 'tier2', reason: 'criticality-high', override: false }
  }

  if (ALWAYS_TIER0_KINDS.has(input.taskKind)) {
    return {
      tier: 'tier0',
      reason: `mechanical-task-kind:${input.taskKind}`,
      override: false,
    }
  }

  const tokens = input.tokenBudget ?? SMALL_BUDGET_TOKENS

  // Phase-aware routing: lifecycle phase overrides when no other rule matched.
  if (input.phase) {
    const upper = input.phase.toUpperCase()
    if (['ANALYZE', 'DESIGN', 'PLAN', 'DEPLOY'].includes(upper)) {
      return { tier: 'tier2', reason: `phase:${upper}`, override: false }
    }
    if (['IMPLEMENT', 'VALIDATE', 'REVIEW', 'HANDOFF'].includes(upper)) {
      return { tier: 'tier1', reason: `phase:${upper}`, override: false }
    }
    if (upper === 'LISTENING') {
      return { tier: 'tier0', reason: `phase:${upper}`, override: false }
    }
  }

  if (tokens >= LARGE_BUDGET_TOKENS) {
    return { tier: 'tier2', reason: 'large-token-budget', override: false }
  }
  if (tokens >= SMALL_BUDGET_TOKENS) {
    return { tier: 'tier1', reason: 'medium-token-budget', override: false }
  }

  // Small budget + non-mechanical task → tier 1 still safer than tier 0.
  if (input.taskKind === 'unknown') {
    return { tier: 'tier1', reason: 'unknown-task-fallback', override: false }
  }

  return { tier: 'tier1', reason: 'default-tier1', override: false }
}
