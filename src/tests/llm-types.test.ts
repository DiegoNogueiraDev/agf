/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  ChatMessageSchema,
  ModelTierSchema,
  ProviderNameSchema,
  PricingSchema,
  ToolCallParserIdSchema,
  ModelSpecSchema,
  LlmUsageSchema,
  CallContextSchema,
  LlmRequestSchema,
  LlmResponseSchema,
  EmbedRequestSchema,
  EmbedResponseSchema,
  BudgetScopeSchema,
} from '../core/llm/types.js'

describe('ChatMessageSchema', () => {
  it('validates a correct message', () => {
    const msg = ChatMessageSchema.parse({ role: 'user', content: 'hello' })
    expect(msg.role).toBe('user')
    expect(msg.content).toBe('hello')
  })

  it('rejects invalid role', () => {
    expect(() => ChatMessageSchema.parse({ role: 'admin', content: 'x' })).toThrow()
  })
})

describe('ModelTierSchema', () => {
  it('accepts valid tiers', () => {
    expect(ModelTierSchema.parse('cheap')).toBe('cheap')
    expect(ModelTierSchema.parse('mid')).toBe('mid')
    expect(ModelTierSchema.parse('expensive')).toBe('expensive')
    expect(ModelTierSchema.parse('local')).toBe('local')
  })
})

describe('ProviderNameSchema', () => {
  it('accepts known providers', () => {
    expect(ProviderNameSchema.parse('anthropic')).toBe('anthropic')
    expect(ProviderNameSchema.parse('openai')).toBe('openai')
    expect(ProviderNameSchema.parse('gemini')).toBe('gemini')
  })
})

describe('PricingSchema', () => {
  it('validates pricing with required fields', () => {
    const p = PricingSchema.parse({ inputPerMtok: 3, outputPerMtok: 15 })
    expect(p.inputPerMtok).toBe(3)
    expect(p.outputPerMtok).toBe(15)
  })

  it('accepts optional cache fields', () => {
    const p = PricingSchema.parse({
      inputPerMtok: 3,
      outputPerMtok: 15,
      cachedInputPerMtok: 0.3,
      cacheCreationInputPerMtok: 0.75,
    })
    expect(p.cachedInputPerMtok).toBe(0.3)
  })
})

describe('ToolCallParserIdSchema', () => {
  it('accepts valid parser ids', () => {
    expect(ToolCallParserIdSchema.parse('hermes')).toBe('hermes')
    expect(ToolCallParserIdSchema.parse('deepseek-v3')).toBe('deepseek-v3')
    expect(ToolCallParserIdSchema.parse('qwen3-coder')).toBe('qwen3-coder')
  })
})

describe('ModelSpecSchema', () => {
  it('validates a model spec', () => {
    const spec = ModelSpecSchema.parse({
      id: 'claude-3-haiku',
      provider: 'anthropic',
      tier: 'cheap',
      contextWindow: 200000,
      pricing: { inputPerMtok: 0.25, outputPerMtok: 1.25 },
    })
    expect(spec.id).toBe('claude-3-haiku')
    expect(spec.contextWindow).toBe(200000)
  })

  it('accepts optional toolCallParserId', () => {
    const spec = ModelSpecSchema.parse({
      id: 'deepseek-v3',
      provider: 'deepseek',
      tier: 'cheap',
      contextWindow: 64000,
      pricing: { inputPerMtok: 0.5, outputPerMtok: 2 },
      toolCallParserId: 'deepseek-v3',
    })
    expect(spec.toolCallParserId).toBe('deepseek-v3')
  })
})

describe('LlmUsageSchema', () => {
  it('validates usage', () => {
    const u = LlmUsageSchema.parse({ inputTokens: 100, outputTokens: 50 })
    expect(u.inputTokens).toBe(100)
  })

  it('accepts cache fields', () => {
    const u = LlmUsageSchema.parse({
      inputTokens: 100,
      outputTokens: 50,
      cachedInputTokens: 80,
      cacheCreationInputTokens: 20,
    })
    expect(u.cachedInputTokens).toBe(80)
  })
})

describe('CallContextSchema', () => {
  it('validates call context', () => {
    const ctx = CallContextSchema.parse({ caller: 'test', sessionId: 'sess-1' })
    expect(ctx.caller).toBe('test')
    expect(ctx.sessionId).toBe('sess-1')
  })
})

describe('LlmRequestSchema', () => {
  it('validates a request', () => {
    const req = LlmRequestSchema.parse({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(req.model).toBe('gpt-4')
  })
})

describe('LlmResponseSchema', () => {
  it('validates a response', () => {
    const res = LlmResponseSchema.parse({
      model: 'gpt-4',
      content: 'Hello!',
      usage: { inputTokens: 10, outputTokens: 5 },
    })
    expect(res.content).toBe('Hello!')
    expect(res.usage.inputTokens).toBe(10)
  })
})

describe('EmbedRequestSchema', () => {
  it('validates string input', () => {
    const req = EmbedRequestSchema.parse({ input: 'text' })
    expect(req.input).toBe('text')
  })

  it('defaults model', () => {
    const req = EmbedRequestSchema.parse({ input: 'text' })
    expect(req.model).toBe('text-embedding-3-small')
  })
})

describe('EmbedResponseSchema', () => {
  it('validates vectors', () => {
    const res = EmbedResponseSchema.parse({
      vectors: [[0.1, 0.2]],
      usage: { inputTokens: 5 },
    })
    expect(res.vectors[0]).toHaveLength(2)
  })
})

describe('BudgetScopeSchema', () => {
  it('validates budget scope', () => {
    const b = BudgetScopeSchema.parse({
      scope: 'session',
      currentUsd: 0.5,
      capUsd: 10,
    })
    expect(b.scope).toBe('session')
  })
})
