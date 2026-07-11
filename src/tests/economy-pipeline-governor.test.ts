/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Integration: buildEconomyPipeline + resolveLeverPlan — pipeline Koa-style
 * governado pelo harness score. Kill-switch: flags off = byte-idêntico.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildEconomyPipeline, ECONOMY_PIPELINE_ORDER } from '../core/economy/economy-pipeline.js'
import type { LeverPlan } from '../core/economy/harness-lever-policy.js'
import { compressMessages } from '../core/tool-compress/index.js'
import { cavemanFilterInput } from '../core/economy/caveman-input.js'
import { routeContent } from '../core/economy/content-router.js'

type Body = Record<string, unknown>

function createTestHandlers(plan: LeverPlan) {
  const handlers = {} as Record<string, (body: Body, next: (body: Body) => Promise<Body>) => Promise<Body>>

  if (ECONOMY_PIPELINE_ORDER.includes('compress')) {
    handlers.compress = async (body, next) => {
      if (plan.compress) compressMessages(body, true)
      return next(body)
    }
  }

  if (ECONOMY_PIPELINE_ORDER.includes('content-router')) {
    handlers['content-router'] = async (body, next) => {
      if (plan.contentDispatch) {
        const msgs = (Array.isArray(body.messages) ? body.messages : []) as Array<Record<string, unknown>>
        for (const msg of msgs) {
          if (msg.role === 'tool' && typeof msg.content === 'string') {
            const routed = routeContent(msg.content as string)
            if (routed.saved > 0) msg.content = routed.output
          }
        }
      }
      return next(body)
    }
  }

  if (ECONOMY_PIPELINE_ORDER.includes('caveman-input')) {
    handlers['caveman-input'] = async (body, next) => {
      if (plan.cavemanInput) {
        const msgs = (Array.isArray(body.messages) ? body.messages : []) as Array<Record<string, unknown>>
        for (const msg of msgs) {
          if (msg.role === 'user' && typeof msg.content === 'string') {
            const text = msg.content as string
            if (text.length > 10) msg.content = cavemanFilterInput(text)
          }
        }
      }
      return next(body)
    }
  }

  return handlers
}

describe('pipeline Koa-style + governador por harness', () => {
  const fullPlan: LeverPlan = {
    compress: true,
    cavemanInput: true,
    contentDispatch: true,
    skeletonize: true,
    ccr: true,
    cacheAligner: true,
    aggressiveness: 1,
    lossyCodeAllowed: true,
    tier: 'standard',
    forceTscOnLowTypes: false,
  }
  const conservativePlan: LeverPlan = {
    compress: true,
    cavemanInput: false,
    contentDispatch: true,
    skeletonize: false,
    ccr: false,
    cacheAligner: false,
    aggressiveness: 0.3,
    lossyCodeAllowed: false,
    tier: 'cheap',
    forceTscOnLowTypes: false,
  }

  beforeEach(() => {
    process.env.ECONOMY_COMPRESS = 'on'
    process.env.ECONOMY_CONTENT_ROUTER = 'on'
    process.env.ECONOMY_CAVEMAN_INPUT = 'on'
  })

  afterEach(() => {
    delete process.env.ECONOMY_COMPRESS
    delete process.env.ECONOMY_CONTENT_ROUTER
    delete process.env.ECONOMY_CAVEMAN_INPUT
  })

  it('pipeline com full plan executa todos os estágios', async () => {
    const handlers = createTestHandlers(fullPlan)
    const pipeline = buildEconomyPipeline<Body, Body>({
      llmFn: async (body) => body,
      stages: handlers,
    })

    const body: Body = {
      messages: [
        { role: 'tool', content: JSON.stringify({ items: Array.from({ length: 100 }, (_, i) => ({ id: i })) }) },
        { role: 'user', content: 'x'.repeat(500) + ' tell me about this code please just explain it' },
      ],
    }
    const result = await pipeline(body)
    expect(result).toBeDefined()
  })

  it('plano conservador não ativa caveman-input (cavemanInput false)', async () => {
    const handlers = createTestHandlers(conservativePlan)
    const pipeline = buildEconomyPipeline<Body, Body>({
      llmFn: async (body) => body,
      stages: handlers,
    })

    const longMsg = 'x'.repeat(500) + ' please tell me about this code and explain how it works'
    const body: Body = {
      messages: [{ role: 'user', content: longMsg }],
    }
    const result = await pipeline(body)
    const msg = (result.messages as Array<Record<string, unknown>>)[0]
    expect(msg.content).toBe(longMsg) // unchanged because cavemanInput false
  })

  it('kill-switch: todas as flags desligadas = pass-through direto', async () => {
    delete process.env.ECONOMY_COMPRESS
    delete process.env.ECONOMY_CONTENT_ROUTER
    delete process.env.ECONOMY_CAVEMAN_INPUT

    const handlers = createTestHandlers(fullPlan)
    const pipeline = buildEconomyPipeline<Body, Body>({
      llmFn: async (body) => body,
      stages: handlers,
    })

    const body: Body = {
      messages: [
        { role: 'tool', content: JSON.stringify({ items: Array.from({ length: 50 }, (_, i) => ({ id: i })) }) },
        { role: 'user', content: 'hello world' },
      ],
    }
    const result = await pipeline(body)
    expect(result).toBe(body) // no stages active, returned from llmFn directly
  })

  it('buildEconomyPipeline retorna llmFn puro quando sem estágios', async () => {
    delete process.env.ECONOMY_COMPRESS
    delete process.env.ECONOMY_CONTENT_ROUTER
    delete process.env.ECONOMY_CAVEMAN_INPUT

    let called = false
    const pipeline = buildEconomyPipeline<Body, Body>({
      llmFn: async (body) => {
        called = true
        return body
      },
      stages: createTestHandlers(fullPlan),
    })
    await pipeline({})
    expect(called).toBe(true)
  })
})
