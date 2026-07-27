/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Cascata viva no model-client (node_d2f4062a845f): o TieredModelClient roda o laço
 * draft→verify→escalate (runCascade, A.T2) quando o cascade wire está presente.
 * OFF (wire null) => single generate byte-idêntico; ON => draft barato, escala só
 * se o verificador reprovar, preservando o ModelResponse completo do vencedor.
 */

import { describe, it, expect } from 'vitest'
import {
  TieredModelClient,
  type ModelAdapter,
  type ModelRequest,
  type ModelResponse,
} from '../core/model-hub/model-client.js'

function countingAdapter(): { adapter: ModelAdapter; byModel: () => Record<string, number> } {
  const calls: Record<string, number> = {}
  return {
    adapter: {
      async generate(req: ModelRequest): Promise<ModelResponse> {
        calls[req.model] = (calls[req.model] ?? 0) + 1
        return { text: `resp-${req.model}`, model: req.model, tokensIn: 10, tokensOut: 5 }
      },
    },
    byModel: () => calls,
  }
}

const okVerdict = { pass: true, score: 1, reasons: [] as string[] }
const badVerdict = { pass: false, score: 0.2, reasons: ['ac-coverage fraco'] }

describe('TieredModelClient — cascata (node_d2f4062a845f)', () => {
  it('sem cascade wire (default) => single generate, byte-idêntico', async () => {
    const { adapter, byModel } = countingAdapter()
    const client = new TieredModelClient(adapter, { mode: 'auto' })
    const res = await client.run('classify', 'prompt')
    // um único generate (modelo resolvido pelo tier-router legado), zero cascata
    expect(Object.values(byModel()).reduce((a, b) => a + b, 0)).toBe(1)
    expect(res.text.startsWith('resp-')).toBe(true)
    expect(client.hasCascade()).toBe(false)
  })

  it('AC1: draft barato aprovado => zero chamadas ao tier caro; response completo do barato', async () => {
    const { adapter, byModel } = countingAdapter()
    const client = new TieredModelClient(adapter, { mode: 'auto' }, undefined, {
      models: ['cheap', 'frontier'],
      verify: () => okVerdict,
      maxEscalations: 1,
    })
    const res = await client.run('classify', 'prompt')
    expect(byModel().cheap).toBe(1)
    expect(byModel().frontier ?? 0).toBe(0)
    expect(res.text).toBe('resp-cheap')
    expect(res.tokensIn).toBe(10) // ModelResponse completo preservado, não só text
    expect(client.hasCascade()).toBe(true)
  })

  it('AC2: draft barato reprovado => 1 escalada, response do caro, onEscalation disparado', async () => {
    const { adapter, byModel } = countingAdapter()
    const escalations: Array<{ from: string; to: string }> = []
    const client = new TieredModelClient(adapter, { mode: 'auto' }, undefined, {
      models: ['cheap', 'frontier'],
      verify: (text: string) => (text.includes('frontier') ? okVerdict : badVerdict),
      maxEscalations: 1,
      onEscalation: (e) => escalations.push({ from: e.from, to: e.to }),
    })
    const res = await client.run('build', 'prompt')
    expect(byModel().cheap).toBe(1)
    expect(byModel().frontier).toBe(1)
    expect(res.text).toBe('resp-frontier')
    expect(escalations).toEqual([{ from: 'cheap', to: 'frontier' }])
  })
})
