import { describe, it, expect } from 'vitest'
import {
  TieredModelClient,
  type ModelAdapter,
  type ModelRequest,
  type ModelResponse,
} from '../core/model-hub/model-client.js'

/** Adapter fake que ecoa o request — registra qual modelo foi roteado. */
function makeFakeAdapter(): ModelAdapter & { lastModel: string | null } {
  let lastModel: string | null = null
  return {
    get lastModel() {
      return lastModel
    },
    async generate(req: ModelRequest): Promise<ModelResponse> {
      lastModel = req.model
      return { text: `echo:${req.prompt}`, model: req.model, tokensIn: 1, tokensOut: 1 }
    },
  }
}

describe('TieredModelClient — roteia a tarefa e delega ao adapter', () => {
  it('auto: implement vai para o tier build (Sonnet 4.6)', async () => {
    const adapter = makeFakeAdapter()
    const client = new TieredModelClient(adapter, { mode: 'auto' })
    const res = await client.run('implement', 'faça X')
    expect(res.model).toBe('claude-sonnet-4-6')
    expect(adapter.lastModel).toBe('claude-sonnet-4-6')
    expect(res.text).toBe('echo:faça X')
  })

  it('auto: plan vai para o frontier (Opus 4.8)', async () => {
    const adapter = makeFakeAdapter()
    const client = new TieredModelClient(adapter, { mode: 'auto' })
    const res = await client.run('plan', 'planeje')
    expect(res.model).toBe('claude-opus-4-8')
  })

  it('pinned: usa o modelo fixado independente da tarefa', async () => {
    const adapter = makeFakeAdapter()
    const client = new TieredModelClient(adapter, { mode: 'pinned', modelId: 'gpt-5.4' })
    expect((await client.run('classify', 'c')).model).toBe('gpt-5.4')
    expect((await client.run('implement', 'i')).model).toBe('gpt-5.4')
  })

  it('propaga o system prompt ao adapter', async () => {
    let seen: ModelRequest | null = null
    const adapter: ModelAdapter = {
      async generate(req) {
        seen = req
        return { text: 'ok', model: req.model }
      },
    }
    const client = new TieredModelClient(adapter, { mode: 'auto' })
    await client.run('review', 'revise', 'você é um revisor')
    expect(seen!.system).toBe('você é um revisor')
  })
})
