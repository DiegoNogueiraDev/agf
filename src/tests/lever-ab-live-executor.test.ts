/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_583654b9f480 — o executor ao vivo que nunca existiu.
 *
 * Os DOIS harnesses de A/B do projeto (`runLeverAb` e `runCascadeAb`) declaram
 * uma porta DIP e recebiam, do CLI, um objeto cujo `available()` devolve `false`
 * por construção (`NO_LIVE_LEVER_AB_EXECUTOR`). Resultado medido: todo comando de
 * A/B respondia `mode:'delegated'` com chave carregada e provider selecionado —
 * `eval_experiments` com 0 linhas, nenhum veredito jamais gravado, e portanto o
 * smart-default (node_b1d2aafb4b0a) correto e eternamente inerte.
 *
 * A armadilha que isto fecha: superfície viva não prova capacidade viva. O
 * comando existia, tinha `--help`, estava no índice do RAG e devolvia `ok:true`.
 *
 * O QUE FAZ UM BRAÇO SER HONESTO: o lever precisa mudar a ENTRADA. Se os dois
 * braços enviassem o mesmo prompt, `savedTokens` seria sempre 0 e a medição
 * viraria teatro — por isso o braço monta o corpo pelo middleware de economia
 * REAL, com o lever ligado/desligado, e mede o que de fato saiu.
 *
 * A config do arm vive num DB de rascunho: alternar o lever no projeto do
 * usuário para medir seria efeito colateral inaceitável de um experimento.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { createLiveLeverAbExecutor, armLeverConfig } from '../core/economy/lever-ab-live-executor.js'
import type { ModelAdapter, ModelResponse, ModelRequest } from '../core/model-hub/model-client.js'

/**
 * Adapter em processo que CONTA o que recebeu. Não é dublê da minha lógica: é o
 * transporte real da porta `ModelAdapter`, medindo tokens pelo tamanho do prompt
 * que efetivamente chegou — que é exatamente o que o A/B precisa observar.
 */
function countingAdapter(): ModelAdapter & { prompts: string[] } {
  const prompts: string[] = []
  return {
    prompts,
    async generate(req: ModelRequest): Promise<ModelResponse> {
      prompts.push(req.prompt)
      return {
        text: 'ok',
        model: req.model,
        tokensIn: Math.ceil(req.prompt.length / 4),
        tokensOut: 1,
      }
    },
  }
}

function deps(adapter: ModelAdapter, over: Record<string, unknown> = {}) {
  return {
    adapter,
    model: 'test-model',
    provider: 'test-provider',
    costPerInputToken: 0.000001,
    costPerOutputToken: 0.000002,
    buildBody: (task: string) => ({
      messages: [
        { role: 'user', content: `implemente ${task}` },
        {
          role: 'tool',
          content: JSON.stringify(Array.from({ length: 40 }, (_, i) => ({ id: i, kind: 'row', ok: true }))),
        },
      ],
    }),
    rootDir: process.cwd(),
    ...over,
  }
}

describe('createLiveLeverAbExecutor — available() reflete provider REAL (AC3)', () => {
  it('sem adapter não está disponível — o fallback honesto não regride', () => {
    const exec = createLiveLeverAbExecutor(deps(countingAdapter(), { adapter: null }))

    expect(exec.available()).toBe(false)
  })

  it('com adapter está disponível (AC1)', () => {
    expect(createLiveLeverAbExecutor(deps(countingAdapter())).available()).toBe(true)
  })
})

describe('cada braço faz uma chamada REAL e devolve uso medido (AC1)', () => {
  it('devolve tokens vindos da resposta, não constantes', async () => {
    const adapter = countingAdapter()
    const exec = createLiveLeverAbExecutor(deps(adapter))

    const usage = await exec.runArm('ncd_dedup', 'off', 'node_x')

    expect(usage.inputTokens).toBeGreaterThan(0)
    expect(usage.outputTokens).toBe(1)
    expect(adapter.prompts, 'nenhuma chamada real foi feita').toHaveLength(1)
  })

  it('o custo é derivado dos tokens medidos — não um placeholder', async () => {
    const adapter = countingAdapter()
    const exec = createLiveLeverAbExecutor(deps(adapter))

    const usage = await exec.runArm('ncd_dedup', 'off', 'node_x')

    expect(usage.costUsd).toBeCloseTo(usage.inputTokens * 0.000001 + usage.outputTokens * 0.000002, 10)
  })

  it('reporta o provider e o modelo que realmente atenderam', async () => {
    const usage = await createLiveLeverAbExecutor(deps(countingAdapter())).runArm('ncd_dedup', 'off', 'node_x')

    expect(usage.provider).toBe('test-provider')
    expect(usage.model).toBe('test-model')
  })
})

describe('o braço carrega a config do lever, e ela é o que difere (AC2)', () => {
  it('ON e OFF resolvem configs OPOSTAS para o mesmo lever', () => {
    // O que ESTE módulo garante é que o braço chega ao middleware com o lever
    // ligado ou desligado. Se ambos os braços mandassem a mesma config, o A/B
    // seria estruturalmente incapaz de medir e devolveria sempre savedTokens 0.
    expect(armLeverConfig('mdl_select', 'on').mdl_select.enabled).toBe(true)
    expect(armLeverConfig('mdl_select', 'off').mdl_select.enabled).toBe(false)
  })

  it('a config nomeia SÓ o lever em teste — vizinho ligado contaminaria a medição', () => {
    // Dois levers ativos no mesmo braço tornariam impossível atribuir o ganho a
    // um deles, que é exatamente o problema que o A/B por lever existe para
    // resolver (o harness antigo media só o carro-chefe).
    expect(Object.keys(armLeverConfig('ncd_dedup', 'on'))).toEqual(['ncd_dedup'])
  })

  it('bytes iguais nos dois braços é um veredito VÁLIDO, não um defeito do executor', async () => {
    // Achado medido neste ciclo: `mdl_select` não é um compressor, é um gate que
    // REVERTE compressão marginal (quando o ganho não paga o resgate). Com ganho
    // folgado ele corretamente não intervém e os dois braços saem idênticos.
    // O executor então reporta economia zero — que é a verdade sobre aquele
    // lever naquele payload, e faz o gate de evidência manter o default OFF.
    const adapter = countingAdapter()
    const exec = createLiveLeverAbExecutor(deps(adapter))

    const off = await exec.runArm('mdl_select', 'off', 'node_x')
    const on = await exec.runArm('mdl_select', 'on', 'node_x')

    expect(on.inputTokens).toBe(off.inputTokens)
    expect(adapter.prompts, 'os dois braços precisam ter chamado de verdade').toHaveLength(2)
  })

  it('não deixa resíduo na config do projeto — o experimento não muda o estado do usuário', async () => {
    // Alternar o lever no projeto real para medir seria efeito colateral: o
    // usuário terminaria o A/B com um default diferente do que tinha.
    const db = new Database(':memory:')
    db.exec('CREATE TABLE project_settings (key TEXT PRIMARY KEY, value TEXT)')
    const exec = createLiveLeverAbExecutor(deps(countingAdapter(), { projectDb: db }))

    await exec.runArm('ncd_dedup', 'on', 'node_x')

    const rows = db.prepare('SELECT COUNT(*) c FROM project_settings').get() as { c: number }
    expect(rows.c, 'o A/B escreveu na config do projeto').toBe(0)
  })
})

describe('falha de provider não vira número inventado (AC3)', () => {
  it('propaga o erro em vez de devolver uso zerado', async () => {
    // Um braço que falha e volta 0 tokens seria lido como "economizou tudo" —
    // o pior falso positivo possível para algo que muda um default.
    const exploding: ModelAdapter = {
      async generate(): Promise<ModelResponse> {
        throw new Error('provider 503')
      },
    }
    const exec = createLiveLeverAbExecutor(deps(exploding))

    await expect(exec.runArm('ncd_dedup', 'on', 'node_x')).rejects.toThrow('503')
  })

  it('resposta sem contagem de tokens é erro, não zero silencioso', async () => {
    const semTokens: ModelAdapter = {
      async generate(req: ModelRequest): Promise<ModelResponse> {
        return { text: 'ok', model: req.model }
      },
    }
    const exec = createLiveLeverAbExecutor(deps(semTokens))

    await expect(exec.runArm('ncd_dedup', 'on', 'node_x')).rejects.toThrow(/token/i)
  })
})

describe('o custo vem do modelo que REALMENTE respondeu (node_583654b9f480)', () => {
  it('um modelo do catálogo é cobrado pelo preço dele, não pelos coeficientes do chamador', async () => {
    const catalogado: ModelAdapter = {
      async generate(): Promise<ModelResponse> {
        return { text: 'ok', model: 'openai/gpt-4o', tokensIn: 1000, tokensOut: 1000 }
      },
    }
    const usage = await createLiveLeverAbExecutor(deps(catalogado)).runArm('ncd_dedup', 'on', 'node_x')

    // Coeficientes injetados dariam 0.003; o catálogo cobra ordens de grandeza mais.
    expect(usage.costUsd).toBeGreaterThan(0.003)
  })

  it('modelo DESCONHECIDO não herda preço default — isso seria cobrar pelo modelo errado', async () => {
    // `getModelCapabilities` devolve um default para id desconhecido. Usá-lo
    // produziria um custo que parece medido e é chute — exatamente o defeito que
    // este épico existe para eliminar.
    const desconhecido: ModelAdapter = {
      async generate(): Promise<ModelResponse> {
        return { text: 'ok', model: 'modelo-que-nao-existe', tokensIn: 1000, tokensOut: 1000 }
      },
    }
    const usage = await createLiveLeverAbExecutor(deps(desconhecido)).runArm('ncd_dedup', 'on', 'node_x')

    expect(usage.costUsd).toBeCloseTo(1000 * 0.000001 + 1000 * 0.000002, 10)
  })
})
