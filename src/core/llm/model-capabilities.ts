/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §Task 1.5 -- ModelCapabilities: deterministic lookup table for LLM model metadata.
 * Zero LLM calls. All data is statically defined and frozen at module load.
 */

export interface PricingPer1kTokens {
  input: number
  output: number
  cacheWrite?: number
  cacheRead?: number
}

export interface ModelCapabilities {
  supportsPromptCaching: boolean
  supportsVision: boolean
  contextWindow: number
  maxOutputTokens: number
  supportedRoles: string[]
  pricingPer1kTokens: PricingPer1kTokens
}

const CONSERVATIVE_DEFAULTS: ModelCapabilities = {
  supportsPromptCaching: false,
  supportsVision: false,
  contextWindow: 8_192,
  maxOutputTokens: 4_096,
  supportedRoles: ['user', 'assistant'],
  pricingPer1kTokens: { input: 0.01, output: 0.03 },
}

export const MODEL_CATALOG: Record<string, ModelCapabilities> = {
  'anthropic/claude-sonnet-4-6': {
    supportsPromptCaching: true,
    supportsVision: true,
    contextWindow: 200_000,
    maxOutputTokens: 64_000,
    supportedRoles: ['user', 'assistant', 'system'],
    pricingPer1kTokens: { input: 0.003, output: 0.015, cacheWrite: 0.00375, cacheRead: 0.0003 },
  },
  'anthropic/claude-opus-4-7': {
    supportsPromptCaching: true,
    supportsVision: true,
    contextWindow: 200_000,
    maxOutputTokens: 32_000,
    supportedRoles: ['user', 'assistant', 'system'],
    pricingPer1kTokens: { input: 0.015, output: 0.075, cacheWrite: 0.01875, cacheRead: 0.0015 },
  },
  'anthropic/claude-haiku-4-5': {
    supportsPromptCaching: true,
    supportsVision: true,
    contextWindow: 200_000,
    maxOutputTokens: 8_096,
    supportedRoles: ['user', 'assistant', 'system'],
    pricingPer1kTokens: { input: 0.0008, output: 0.004, cacheWrite: 0.001, cacheRead: 0.00008 },
  },
  'openai/gpt-4o': {
    supportsPromptCaching: false,
    supportsVision: true,
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    supportedRoles: ['user', 'assistant', 'system'],
    pricingPer1kTokens: { input: 0.005, output: 0.015 },
  },
  'openai/gpt-4o-mini': {
    supportsPromptCaching: false,
    supportsVision: true,
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    supportedRoles: ['user', 'assistant', 'system'],
    pricingPer1kTokens: { input: 0.00015, output: 0.0006 },
  },
  'google/gemini-2.0-flash': {
    supportsPromptCaching: false,
    supportsVision: true,
    contextWindow: 1_048_576,
    maxOutputTokens: 8_192,
    supportedRoles: ['user', 'assistant', 'system'],
    pricingPer1kTokens: { input: 0.0001, output: 0.0004 },
  },
  'deepseek/deepseek-v3': {
    supportsPromptCaching: false,
    supportsVision: false,
    contextWindow: 64_000,
    maxOutputTokens: 8_192,
    supportedRoles: ['user', 'assistant', 'system'],
    pricingPer1kTokens: { input: 0.00027, output: 0.0011 },
  },
}

/**
 * Detecção lenitiva de visão por id de modelo em runtime (ids variam por provider:
 * `gpt-4o`, `openai/gpt-4o`, `claude-sonnet-4.6`, `qwen2.5-coder:14b`…). Tenta o
 * catálogo (exato/sufixo) e, senão, heurística por família conhecida de visão.
 * Conservador: na dúvida, `false` (o caminho determinístico/OCR é preferido).
 */
export function supportsVision(modelId: string): boolean {
  const id = modelId.toLowerCase()
  if (MODEL_CATALOG[modelId]?.supportsVision) return true
  for (const [key, caps] of Object.entries(MODEL_CATALOG)) {
    if (
      caps.supportsVision &&
      (key.toLowerCase().endsWith(id) || id.endsWith(key.toLowerCase().split('/').pop() ?? key))
    ) {
      return true
    }
  }
  // Famílias com visão (independe do provider/slug).
  return /(gpt-4o|gpt-4\.1|gpt-5|o4|claude-(3|4|sonnet|opus|haiku)|gemini|llava|qwen.*vl|pixtral|llama-3\.2.*vision)/.test(
    id,
  )
}

/** Returns capabilities for a model. Unknown models return conservative defaults — never throws. */
export function getModelCapabilities(modelId: string): ModelCapabilities {
  return MODEL_CATALOG[modelId] ?? CONSERVATIVE_DEFAULTS
}
