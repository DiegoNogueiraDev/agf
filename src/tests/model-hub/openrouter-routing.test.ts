/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import {
  routeModel,
  routeModelForProvider,
  looksExternalModel,
  resolveOpenRouterModel,
} from '../../core/model-hub/tier-router.js'
import { getModelPricing } from '../../core/observability/cost-tracker.js'

describe('tier-router — OpenRouter routing', () => {
  it('pinned: id externo (deepseek/...) passa sem throw', () => {
    expect(looksExternalModel('deepseek/deepseek-chat')).toBe(true)
    expect(routeModel({ mode: 'pinned', modelId: 'deepseek/deepseek-chat' }, 'implement')).toBe(
      'deepseek/deepseek-chat',
    )
  })

  it('pinned: id interno desconhecido (sem /) ainda lança', () => {
    expect(() => routeModel({ mode: 'pinned', modelId: 'modelo-fantasma' }, 'implement')).toThrow()
  })

  it('auto + openrouter: tier-map benchmark MoE', () => {
    expect(routeModelForProvider({ mode: 'auto' }, 'classify', 'openrouter')).toBe(resolveOpenRouterModel('cheap'))
    expect(routeModelForProvider({ mode: 'auto' }, 'plan', 'openrouter')).toBe('qwen/qwen3.6-plus')
  })

  it('auto + copilot (sem provider): roteamento interno (Sonnet 4.6 default build)', () => {
    const m = routeModelForProvider({ mode: 'auto' }, 'implement', undefined)
    expect(m).toBe('claude-sonnet-4-6')
  })

  it('pricing resolve por prefixo (custo > 0)', () => {
    expect(getModelPricing('deepseek/deepseek-v4-flash')?.inputPer1M).toBeGreaterThan(0)
    expect(getModelPricing('claude-sonnet-4.6')?.outputPer1M).toBeGreaterThan(0)
  })
})
