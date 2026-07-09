/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Tests for model capabilities lookup.
 */

import { describe, it, expect } from 'vitest'
import { getModelCapabilities, MODEL_CATALOG } from '../core/llm/model-capabilities.js'

describe('getModelCapabilities', () => {
  it('returns capabilities for anthropic/claude-sonnet-4-6', () => {
    const c = getModelCapabilities('anthropic/claude-sonnet-4-6')
    expect(c.supportsPromptCaching).toBe(true)
    expect(c.supportsVision).toBe(true)
    expect(c.contextWindow).toBe(200_000)
    expect(c.maxOutputTokens).toBe(64_000)
    expect(c.supportedRoles).toContain('system')
    expect(c.pricingPer1kTokens.input).toBe(0.003)
    expect(c.pricingPer1kTokens.output).toBe(0.015)
  })

  it('returns capabilities for anthropic/claude-haiku-4-5', () => {
    const c = getModelCapabilities('anthropic/claude-haiku-4-5')
    expect(c.supportsPromptCaching).toBe(true)
    expect(c.supportsVision).toBe(true)
    expect(c.contextWindow).toBe(200_000)
    expect(c.maxOutputTokens).toBe(8_096)
  })

  it('returns capabilities for openai/gpt-4o', () => {
    const c = getModelCapabilities('openai/gpt-4o')
    expect(c.supportsPromptCaching).toBe(false)
    expect(c.supportsVision).toBe(true)
    expect(c.contextWindow).toBe(128_000)
    expect(c.maxOutputTokens).toBe(16_384)
  })

  it('returns capabilities for openai/gpt-4o-mini', () => {
    const c = getModelCapabilities('openai/gpt-4o-mini')
    expect(c.pricingPer1kTokens.input).toBe(0.00015)
    expect(c.pricingPer1kTokens.output).toBe(0.0006)
  })

  it('returns capabilities for google/gemini-2.0-flash', () => {
    const c = getModelCapabilities('google/gemini-2.0-flash')
    expect(c.contextWindow).toBe(1_048_576)
    expect(c.supportsVision).toBe(true)
  })

  it('returns capabilities for deepseek/deepseek-v3', () => {
    const c = getModelCapabilities('deepseek/deepseek-v3')
    expect(c.supportsVision).toBe(false)
    expect(c.contextWindow).toBe(64_000)
  })

  it('returns conservative defaults for unknown model', () => {
    const c = getModelCapabilities('unknown/model')
    expect(c.supportsPromptCaching).toBe(false)
    expect(c.supportsVision).toBe(false)
    expect(c.contextWindow).toBe(8_192)
    expect(c.maxOutputTokens).toBe(4_096)
    expect(c.supportedRoles).toEqual(['user', 'assistant'])
  })

  it('MODEL_CATALOG contains all expected entries', () => {
    expect(Object.keys(MODEL_CATALOG)).toEqual([
      'anthropic/claude-sonnet-4-6',
      'anthropic/claude-opus-4-7',
      'anthropic/claude-haiku-4-5',
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'google/gemini-2.0-flash',
      'deepseek/deepseek-v3',
    ])
  })
})
