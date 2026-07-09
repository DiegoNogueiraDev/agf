/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Cognitive-debt indicator — an opt-in metric for the anti-vibe-coding pillar.
 *
 * Grounded in Kosmyna et al., "Your Brain on ChatGPT: Accumulation of Cognitive
 * Debt when Using an AI Assistant for Essay Writing Task" (MIT Media Lab): the
 * more cognition is delegated to an LLM, the more "cognitive debt" accumulates.
 *
 * agf is delegate-first, so llm_call_ledger tokens measure how much a run leaned
 * on agf's own LLM instead of the human/external agent. This turns that ledger
 * into a reliance signal: reliance = (tasks that used the LLM) / (tasks done).
 * Zero tokens ⇒ zero debt — which is exactly the delegate-first ideal, not a bug.
 *
 * Pure — no I/O, no graph mutation. The caller supplies aggregated ledger rows.
 */

export type CognitiveDebtLevel = 'none' | 'low' | 'moderate' | 'high'

export interface CognitiveDebtInput {
  /** Per-task token totals from the llm_call_ledger (summarizeLedger().byTask). */
  taskTokens: ReadonlyArray<{ nodeId: string; total: number }>
  /** Denominator: tasks considered done (brain-only + LLM-assisted). */
  totalTasks: number
}

export interface CognitiveDebtReport {
  /** Distinct tasks with at least one LLM token attributed. */
  llmAssistedTasks: number
  /** Denominator used for the ratio. */
  totalTasks: number
  /** Sum of tokens across LLM-assisted tasks. */
  totalTokens: number
  /** Mean tokens per LLM-assisted task (0 when none). */
  avgTokensPerAssistedTask: number
  /** Share of tasks that leaned on the LLM, in [0, 1]. */
  relianceRatio: number
  /** Banded interpretation of relianceRatio. */
  level: CognitiveDebtLevel
  /** Provenance + interpretation, citing the MIT study. */
  note: string
}

const LOW_MAX = 0.34
const MODERATE_MAX = 0.67

function bandLevel(ratio: number): CognitiveDebtLevel {
  if (ratio <= 0) return 'none'
  if (ratio < LOW_MAX) return 'low'
  if (ratio < MODERATE_MAX) return 'moderate'
  return 'high'
}

/**
 * Compute the cognitive-debt indicator from aggregated ledger rows. The ratio
 * is clamped to [0, 1]: the denominator is `max(totalTasks, llmAssistedTasks)`
 * so ledger activity for tasks not counted as done can never push reliance > 1.
 */
export function computeCognitiveDebt(input: CognitiveDebtInput): CognitiveDebtReport {
  const assisted = input.taskTokens.filter((t) => t.total > 0)
  const llmAssistedTasks = assisted.length
  const totalTokens = assisted.reduce((sum, t) => sum + t.total, 0)
  const avgTokensPerAssistedTask = llmAssistedTasks > 0 ? Math.round(totalTokens / llmAssistedTasks) : 0

  const denom = Math.max(input.totalTasks, llmAssistedTasks)
  const relianceRatio = denom > 0 ? llmAssistedTasks / denom : 0
  const level = bandLevel(relianceRatio)

  const note =
    level === 'none'
      ? 'No LLM reliance recorded — zero cognitive debt (delegate-first ideal). Ref: Kosmyna et al., MIT "Your Brain on ChatGPT".'
      : `${Math.round(relianceRatio * 100)}% of tasks leaned on the LLM (${level} cognitive debt). Ref: Kosmyna et al., MIT "Your Brain on ChatGPT".`

  return {
    llmAssistedTasks,
    totalTasks: input.totalTasks,
    totalTokens,
    avgTokensPerAssistedTask,
    relianceRatio,
    level,
    note,
  }
}
