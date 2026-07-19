/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Cost Tracker — per-model pricing database and cost estimation.
 * Inspired by hermes-agent cost-aware operations.
 * Pricing as of 2025-Q2 (USD per 1M tokens).
 *
 * Supports custom pricing via project_settings:
 *   pricing_input_per_1m, pricing_output_per_1m, pricing_cache_per_1m
 * When defined, overrides MODEL_PRICING for all models.
 */

import { createLogger } from '../utils/logger.js'
import type { SqliteStore } from '../store/sqlite-store.js'

const log = createLogger({ layer: 'core', source: 'cost-tracker.ts' })

export interface ModelPricing {
  inputPer1M: number
  outputPer1M: number
}

export interface CustomPricing {
  inputPer1M: number
  outputPer1M: number
  cachePer1M: number
}

export interface CostBreakdown {
  model: string
  inputTokens: number
  outputTokens: number
  inputCostUsd: number
  outputCostUsd: number
  totalUsd: number
  /** false quando o modelo não tem entrada de pricing — totalUsd=0 é DESCONHECIDO,
   *  não "grátis" (node_f4cf31fb4704). Consumidores não devem tratar como economia. */
  pricingKnown: boolean
}

// ── Pricing database (USD per 1M tokens) ──

export const MODEL_PRICING = new Map<string, ModelPricing>([
  // Anthropic
  ['claude-opus-4', { inputPer1M: 15.0, outputPer1M: 75.0 }],
  ['claude-sonnet-4', { inputPer1M: 3.0, outputPer1M: 15.0 }],
  ['claude-haiku-4', { inputPer1M: 0.8, outputPer1M: 4.0 }],
  ['claude-3-5-sonnet', { inputPer1M: 3.0, outputPer1M: 15.0 }],
  ['claude-3-5-haiku', { inputPer1M: 0.8, outputPer1M: 4.0 }],
  ['claude-3-opus', { inputPer1M: 15.0, outputPer1M: 75.0 }],
  // OpenAI
  ['gpt-4o', { inputPer1M: 2.5, outputPer1M: 10.0 }],
  ['gpt-4o-mini', { inputPer1M: 0.15, outputPer1M: 0.6 }],
  ['gpt-4-turbo', { inputPer1M: 10.0, outputPer1M: 30.0 }],
  ['o1', { inputPer1M: 15.0, outputPer1M: 60.0 }],
  ['o1-mini', { inputPer1M: 3.0, outputPer1M: 12.0 }],
  // Google
  ['gemini-2.0-flash', { inputPer1M: 0.075, outputPer1M: 0.3 }],
  ['gemini-1.5-pro', { inputPer1M: 1.25, outputPer1M: 5.0 }],
  // OpenRouter / DeepSeek (aprox.; sincronizar via `npm run sync:prices`).
  ['deepseek/deepseek-r1', { inputPer1M: 0.55, outputPer1M: 2.19 }],
  ['deepseek/deepseek-chat', { inputPer1M: 0.14, outputPer1M: 0.28 }],
  // Preços REAIS da OpenRouter /models API (node_f4cf31fb4704 — nunca inventados).
  ['deepseek/deepseek-v4-flash', { inputPer1M: 0.098, outputPer1M: 0.196 }],
  ['qwen/qwen3.6-plus', { inputPer1M: 0.325, outputPer1M: 1.95 }],
  ['anthropic/claude-sonnet-5', { inputPer1M: 2.0, outputPer1M: 10.0 }],
  ['deepseek/', { inputPer1M: 0.14, outputPer1M: 0.28 }],
])

/**
 * Look up pricing for a model. Supports exact match and prefix matching
 * (e.g., "claude-sonnet-4-20250514" matches "claude-sonnet-4").
 */
export function getModelPricing(model: string): ModelPricing | undefined {
  // Exact match first
  const exact = MODEL_PRICING.get(model)
  if (exact) return exact

  // Prefix match: find the longest key that the model starts with
  let bestMatch: ModelPricing | undefined
  let bestLength = 0
  for (const [key, pricing] of MODEL_PRICING) {
    if (model.startsWith(key) && key.length > bestLength) {
      bestMatch = pricing
      bestLength = key.length
    }
  }

  return bestMatch
}

/**
 * Calculate cost for a given model and token counts.
 * Returns zero for unknown models (with a warning logged).
 */
/** Cache hit de prefixo é cobrado a ~10% do input (alavanca de cache de prefixo). */
export const CACHE_HIT_RATE = 0.1

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens = 0,
): CostBreakdown {
  const pricing = getModelPricing(model)

  if (!pricing) {
    log.warn('cost-tracker:unknown_model', { model })
    return { model, inputTokens, outputTokens, inputCostUsd: 0, outputCostUsd: 0, totalUsd: 0, pricingKnown: false }
  }

  // Tokens cacheados pagam fração; o restante do input paga cheio.
  const cached = Math.min(Math.max(0, cachedInputTokens), inputTokens)
  const fullInput = inputTokens - cached
  const inputCostUsd =
    (fullInput / 1_000_000) * pricing.inputPer1M + (cached / 1_000_000) * pricing.inputPer1M * CACHE_HIT_RATE
  const outputCostUsd = (outputTokens / 1_000_000) * pricing.outputPer1M

  return {
    model,
    inputTokens,
    outputTokens,
    inputCostUsd,
    outputCostUsd,
    totalUsd: inputCostUsd + outputCostUsd,
    pricingKnown: true,
  }
}

/**
 * Read custom pricing from project settings.
 * Falls back to MODEL_PRICING if not configured.
 * Settings: pricing_input_per_1m, pricing_output_per_1m, pricing_cache_per_1m
 */
export function getCustomPricing(store?: SqliteStore | null): CustomPricing {
  if (!store) return getDefaultPricing()

  const inputRaw = store.getProjectSetting('pricing_input_per_1m')
  const outputRaw = store.getProjectSetting('pricing_output_per_1m')
  const cacheRaw = store.getProjectSetting('pricing_cache_per_1m')

  if (inputRaw || outputRaw || cacheRaw) {
    return {
      inputPer1M: inputRaw ? parseFloat(inputRaw) : 1.0,
      outputPer1M: outputRaw ? parseFloat(outputRaw) : 2.0,
      cachePer1M: cacheRaw ? parseFloat(cacheRaw) : 0.5,
    }
  }

  return getDefaultPricing()
}

/** Default pricing when nothing is configured. */
export function getDefaultPricing(): CustomPricing {
  return { inputPer1M: 1.0, outputPer1M: 2.0, cachePer1M: 0.5 }
}

/**
 * Calculate cost using custom pricing instead of per-model pricing.
 * Used when user has configured flat rates via project settings.
 */
export function calculateCostWithPricing(
  pricing: CustomPricing,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens = 0,
): CostBreakdown {
  const cached = Math.min(Math.max(0, cachedInputTokens), inputTokens)
  const fullInput = inputTokens - cached

  const inputCostUsd = (fullInput / 1_000_000) * pricing.inputPer1M + (cached / 1_000_000) * pricing.cachePer1M
  const outputCostUsd = (outputTokens / 1_000_000) * pricing.outputPer1M

  return {
    model: 'custom',
    inputTokens,
    outputTokens,
    inputCostUsd,
    outputCostUsd,
    totalUsd: inputCostUsd + outputCostUsd,
    pricingKnown: true,
  }
}

/**
 * Format pricing as human-readable string.
 */
export function formatPricing(pricing: CustomPricing): string {
  return `tok_in=$${pricing.inputPer1M.toFixed(2)}/M · tok_cache=$${pricing.cachePer1M.toFixed(2)}/M · tok_out=$${pricing.outputPer1M.toFixed(2)}/M`
}
