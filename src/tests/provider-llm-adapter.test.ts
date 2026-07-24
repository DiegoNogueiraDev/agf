/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes do provider-llm-adapter (node_b4b1674b6b61, Swarm-B) — makeLlm()
 * devolve um AntLlmPort async que REUSA o gateway tiered existente
 * (TieredModelClient.run com learnedTier), mapeando usage→{inputTokens,
 * outputTokens} e classificando erros via classifyLlmError (sem crash cru).
 * Stub de LLM com contador (padrão sancionado do brief — nunca bater em auth).
 */

import { describe, it, expect } from 'vitest'
import { makeLlm, ProviderLlmError } from '../swarming/provider-llm-adapter.js'
import type { ModelResponse } from '../core/model-hub/model-client.js'

interface RunCall {
  kind: string
  prompt: string
  learnedTier?: string
}

function stubClient(response: Partial<ModelResponse> = {}, err?: Error) {
  const calls: RunCall[] = []
  return {
    calls,
    client: {
      run: async (
        kind: string,
        prompt: string,
        _system?: string,
        _phase?: unknown,
        _effort?: unknown,
        _images?: string[],
        learnedTier?: string,
      ): Promise<ModelResponse> => {
        calls.push({ kind, prompt, learnedTier })
        if (err) throw err
        return { text: 'ok-text', model: 'stub-model', tokensIn: 120, tokensOut: 45, ...response }
      },
    },
  }
}

describe('makeLlm (AntLlmPort async sobre o gateway tiered)', () => {
  it('routes tier as learnedTier and maps usage → {inputTokens, outputTokens} (AC1)', async () => {
    const { client, calls } = stubClient()
    const llm = makeLlm({ client })

    const res = await llm.run({ tier: 'cheap', prompt: 'implemente X', nodeId: 'node_x' })

    expect(res.text).toBe('ok-text')
    expect(res.inputTokens).toBe(120)
    expect(res.outputTokens).toBe(45)
    expect(calls).toHaveLength(1)
    expect(calls[0].kind).toBe('implement')
    expect(calls[0].learnedTier).toBe('cheap')
    expect(calls[0].prompt).toBe('implemente X')
  })

  it('reuses the injected gateway client — one run() call per llm.run (AC2, DIP)', async () => {
    const { client, calls } = stubClient()
    const llm = makeLlm({ client })
    await llm.run({ tier: 'frontier', prompt: 'a', nodeId: 'n1' })
    await llm.run({ tier: 'build', prompt: 'b', nodeId: 'n2' })
    expect(calls.map((c) => c.learnedTier)).toEqual(['frontier', 'build'])
  })

  it('usage ausente no response (caso de limite) → tokens 0, nunca NaN/undefined', async () => {
    const { client } = stubClient({ tokensIn: undefined, tokensOut: undefined })
    const llm = makeLlm({ client })
    const res = await llm.run({ tier: 'cheap', prompt: 'p', nodeId: 'n' })
    expect(res.inputTokens).toBe(0)
    expect(res.outputTokens).toBe(0)
  })

  it('provider error → ProviderLlmError tipado com kind do classifyLlmError, sem crash cru (AC3)', async () => {
    const rateLimit = Object.assign(new Error('429 rate limit exceeded'), { status: 429 })
    const { client } = stubClient({}, rateLimit)
    const llm = makeLlm({ client })

    await expect(llm.run({ tier: 'cheap', prompt: 'p', nodeId: 'n' })).rejects.toBeInstanceOf(ProviderLlmError)
    try {
      await llm.run({ tier: 'cheap', prompt: 'p', nodeId: 'n' })
    } catch (err) {
      const e = err as ProviderLlmError
      expect(e.kind).toBeTruthy()
      expect(typeof e.retryable).toBe('boolean')
      expect(e.message).toContain('rate limit')
    }
  })
})
