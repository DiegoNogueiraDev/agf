/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * CachingModelAdapter — decorator de cache de resposta provider-agnóstico. Serve
 * do cache local quando a requisição (normalizada) recorre → 0 token, 0 chamada
 * ao inner adapter. Funciona acima de qualquer ModelAdapter (Copilot/OpenAI-compat).
 */
import { describe, it, expect } from 'vitest'
import { CachingModelAdapter } from '../core/model-hub/caching-model-adapter.js'
import { ResponseCache, createMemoryPersistence } from '../core/llm/response-cache.js'
import type { ModelAdapter, ModelRequest, ModelResponse } from '../core/model-hub/model-client.js'

/** Inner fake que conta chamadas e ecoa um texto determinístico. */
function makeInner(): { adapter: ModelAdapter; calls: () => number } {
  let n = 0
  const adapter: ModelAdapter = {
    generate: async (req: ModelRequest): Promise<ModelResponse> => {
      n++
      return { text: `resp#${n} for ${req.model}`, model: req.model, tokensIn: 100, tokensOut: 40 }
    },
  }
  return { adapter, calls: () => n }
}

function freshCache(): ResponseCache<ModelResponse> {
  return new ResponseCache<ModelResponse>({ schemaVersion: 1, persistence: createMemoryPersistence<ModelResponse>() })
}

describe('CachingModelAdapter — cache local de resposta', () => {
  it('miss → chama o inner 1x e persiste; 2ª idêntica → hit (NÃO chama inner)', async () => {
    const inner = makeInner()
    const adapter = new CachingModelAdapter(inner.adapter, freshCache(), { providerId: 'openrouter' })
    const req: ModelRequest = { model: 'deepseek/deepseek-chat', prompt: 'faça X', system: 'S' }

    const a = await adapter.generate(req)
    expect(a.fromCache).toBeFalsy()
    expect(inner.calls()).toBe(1)

    const b = await adapter.generate(req)
    expect(b.fromCache).toBe(true)
    expect(b.text).toBe(a.text)
    expect(inner.calls()).toBe(1) // inner NÃO foi chamado de novo
  })

  it('normalização: prompts diferindo só no marcador "(id: …)" → mesma chave (hit)', async () => {
    const inner = makeInner()
    const adapter = new CachingModelAdapter(inner.adapter, freshCache(), { providerId: 'copilot' })
    await adapter.generate({ model: 'm', prompt: 'Implemente a task "Soma" (id: run_aaa) seguindo TDD.' })
    const second = await adapter.generate({
      model: 'm',
      prompt: 'Implemente a task "Soma" (id: run_bbb) seguindo TDD.',
    })
    expect(second.fromCache).toBe(true)
    expect(inner.calls()).toBe(1)
  })

  it('chaves distintas por model / system / effort', async () => {
    const inner = makeInner()
    const adapter = new CachingModelAdapter(inner.adapter, freshCache())
    await adapter.generate({ model: 'm1', prompt: 'p' })
    await adapter.generate({ model: 'm2', prompt: 'p' }) // model diferente → miss
    await adapter.generate({ model: 'm1', prompt: 'p', system: 'S' }) // system diferente → miss
    await adapter.generate({ model: 'm1', prompt: 'p', effort: 'high' }) // effort diferente → miss
    expect(inner.calls()).toBe(4)
  })

  it('kill-switch (enabled:false) → sempre chama o inner, nunca cacheia', async () => {
    const inner = makeInner()
    const adapter = new CachingModelAdapter(inner.adapter, freshCache(), { enabled: false })
    const req: ModelRequest = { model: 'm', prompt: 'p' }
    await adapter.generate(req)
    const second = await adapter.generate(req)
    expect(second.fromCache).toBeFalsy()
    expect(inner.calls()).toBe(2)
  })

  it('expõe stats (hits/misses/tokensSaved) p/ o cacheOrchestrator', async () => {
    const inner = makeInner()
    const adapter = new CachingModelAdapter(inner.adapter, freshCache())
    const req: ModelRequest = { model: 'm', prompt: 'p' }
    await adapter.generate(req) // miss
    await adapter.generate(req) // hit
    const reg = adapter.asCacheRegistration()
    expect(reg.hits()).toBe(1)
    expect(reg.misses()).toBe(1)
    expect(reg.tokensSaved()).toBe(140) // 100 in + 40 out economizados no hit
    expect(reg.name).toMatch(/response/i)
  })
})
