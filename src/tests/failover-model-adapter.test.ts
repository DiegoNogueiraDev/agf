/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { FailoverModelAdapter, parseFailoverProviders } from '../core/model-hub/failover-model-adapter.js'
import type { ModelAdapter, ModelRequest, ModelResponse } from '../core/model-hub/model-client.js'
import { getSharedHookBus, _resetSharedHookBus } from '../core/hooks/shared-hook-bus.js'
import type { HookEvent } from '../core/hooks/hook-types.js'

const req: ModelRequest = { model: 'primary', prompt: 'hi' }

function ok(text: string): ModelAdapter {
  return {
    generate: async (r: ModelRequest): Promise<ModelResponse> => ({ text, model: r.model, tokensIn: 1, tokensOut: 1 }),
  }
}
function fails(msg: string): ModelAdapter {
  return {
    generate: async (): Promise<ModelResponse> => {
      throw new Error(msg)
    },
  }
}
function empty(): ModelAdapter {
  return { generate: async (r: ModelRequest): Promise<ModelResponse> => ({ text: '   ', model: r.model }) }
}

describe('FailoverModelAdapter', () => {
  it('1 alvo = passthrough: devolve a resposta (mesmo vazia) e repropaga o erro original', async () => {
    const okOut = await new FailoverModelAdapter([{ providerId: 'p', adapter: empty() }]).generate(req)
    expect(okOut.text).toBe('   ') // vazia, mas é o último → não falha

    const fa = new FailoverModelAdapter([{ providerId: 'p', adapter: fails('boom') }])
    await expect(fa.generate(req)).rejects.toThrow('boom')
  })

  it('cai para o próximo provider em erro e conta o fallback', async () => {
    const fa = new FailoverModelAdapter([
      { providerId: 'a', adapter: fails('a-down') },
      { providerId: 'b', adapter: ok('from-b') },
    ])
    const out = await fa.generate(req)
    expect(out.text).toBe('from-b')
    const st = fa.failoverStatus()
    expect(st.fallbackCount).toBe(1)
    expect(st.targets[0].failures).toBe(1)
    expect(st.targets[0].lastError).toContain('a-down')
  })

  it('resposta vazia conta como falha quando há um próximo alvo', async () => {
    const fa = new FailoverModelAdapter([
      { providerId: 'a', adapter: empty() },
      { providerId: 'b', adapter: ok('from-b') },
    ])
    const out = await fa.generate(req)
    expect(out.text).toBe('from-b')
    expect(fa.failoverStatus().fallbackCount).toBe(1)
  })

  it('todos falham → repropaga o ÚLTIMO erro', async () => {
    const fa = new FailoverModelAdapter([
      { providerId: 'a', adapter: fails('a-down') },
      { providerId: 'b', adapter: fails('b-down') },
    ])
    await expect(fa.generate(req)).rejects.toThrow('b-down')
  })

  it('aplica o override de modelo no alvo de fallback', async () => {
    const fa = new FailoverModelAdapter([
      { providerId: 'a', adapter: fails('a-down') },
      { providerId: 'b', adapter: ok('ok'), model: 'fallback-model' },
    ])
    const out = await fa.generate(req)
    expect(out.model).toBe('fallback-model') // ok() ecoa request.model
  })

  it('alvo único de sucesso não conta fallback', async () => {
    const fa = new FailoverModelAdapter([{ providerId: 'a', adapter: ok('x') }])
    await fa.generate(req)
    expect(fa.failoverStatus().fallbackCount).toBe(0)
  })
})

describe('FailoverModelAdapter — llm-lifecycle-hooks integration (node_wire_02799cf40124)', () => {
  beforeEach(() => {
    _resetSharedHookBus()
    delete process.env.AGF_HOOKS
    delete process.env.MCP_GRAPH_HOOKS_DISABLED
  })
  afterEach(() => {
    _resetSharedHookBus()
  })

  it('emits pre/post_llm_call around a successful single-target generate', async () => {
    const events: HookEvent[] = []
    const bus = getSharedHookBus()
    bus.on('llm:pre-call', (e) => events.push(e))
    bus.on('llm:post-call', (e) => events.push(e))

    const fa = new FailoverModelAdapter([{ providerId: 'a', adapter: ok('x') }])
    await fa.generate(req)

    expect(events.map((e) => e.channel)).toEqual(['llm:pre-call', 'llm:post-call'])
    expect(events[0].payload.provider).toBe('a')
  })

  it('emits on_llm_error + on_llm_retry when falling through to the next target', async () => {
    const events: HookEvent[] = []
    const bus = getSharedHookBus()
    bus.on('llm:error', (e) => events.push(e))
    bus.on('llm:retry', (e) => events.push(e))

    const fa = new FailoverModelAdapter([
      { providerId: 'a', adapter: fails('a-down') },
      { providerId: 'b', adapter: ok('from-b') },
    ])
    await fa.generate(req)

    const channels = events.map((e) => e.channel)
    expect(channels).toContain('llm:error')
    expect(channels).toContain('llm:retry')
    const errorEvent = events.find((e) => e.channel === 'llm:error')
    expect(errorEvent?.payload.provider).toBe('a')
    const retryEvent = events.find((e) => e.channel === 'llm:retry')
    expect(retryEvent?.payload.provider).toBe('b')
  })

  it('does not emit any hook when AGF_HOOKS=0 (kill-switch)', async () => {
    process.env.AGF_HOOKS = '0'
    const events: HookEvent[] = []
    const bus = getSharedHookBus()
    bus.on('llm:pre-call', (e) => events.push(e))

    const fa = new FailoverModelAdapter([{ providerId: 'a', adapter: ok('x') }])
    await fa.generate(req)

    expect(events).toHaveLength(0)
  })
})

describe('parseFailoverProviders', () => {
  it('aceita provider só e provider:model, ignora vazios', () => {
    expect(parseFailoverProviders('openrouter, ollama:qwen2.5-coder:7b ,  , deepseek:')).toEqual([
      { provider: 'openrouter' },
      { provider: 'ollama', model: 'qwen2.5-coder:7b' },
      { provider: 'deepseek' },
    ])
  })

  it('vazio/undefined → []', () => {
    expect(parseFailoverProviders(undefined)).toEqual([])
    expect(parseFailoverProviders('')).toEqual([])
  })
})
