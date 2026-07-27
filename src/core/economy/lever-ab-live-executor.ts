/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * O EXECUTOR AO VIVO DO A/B — a ponta que faltava (node_583654b9f480).
 *
 * `runLeverAb` e `runCascadeAb` sempre declararam uma porta DIP, mas o CLI lhes
 * entregava um objeto cujo `available()` é `false` por construção. Consequência
 * medida: todo comando de A/B respondia `mode:'delegated'` mesmo com chave e
 * provider configurados, `eval_experiments` ficou em 0 linhas, nenhum veredito
 * jamais existiu — e por isso o smart-default que só liga lever com evidência
 * (`lever-evidence-gate.ts`) permanecia correto e eternamente inerte.
 *
 * Lição que este módulo encarna: **superfície viva não prova capacidade viva**.
 * O comando existia, tinha `--help` e devolvia `ok:true`.
 *
 * ─── O que faz um braço ser HONESTO ───────────────────────────────────────
 *
 * O lever precisa mudar a ENTRADA. Se os dois braços enviassem o mesmo prompt,
 * `savedTokens` seria estruturalmente 0 e o A/B pareceria funcionar sem medir
 * nada. Por isso o braço monta o corpo pelo middleware de economia REAL — o
 * mesmo caminho de produção — com o lever ligado ou desligado.
 *
 * A config do braço vive num DB de RASCUNHO. Alternar o lever no projeto do
 * usuário para medir deixaria resíduo: ele terminaria o experimento com um
 * default diferente do que tinha.
 *
 * Erro NUNCA vira zero. Um braço que falha e devolve 0 tokens seria lido como
 * "economizou tudo" — o falso positivo mais caro possível para algo cuja função
 * é mudar um default.
 */

import Database from 'better-sqlite3'
import { createEconomyMiddleware } from './economy-orchestrator.js'
import { ensureLeverLedgerTable } from './economy-lever-ledger.js'
import { ECONOMY_LEVERS_SETTING_KEY, type LeverKey } from './economy-levers-config.js'
import type { LeverAbExecutor, LeverArm, LeverArmUsage } from './lever-ab-harness.js'
import type { ModelAdapter } from '../model-hub/model-client.js'
import { McpGraphError } from '../utils/errors.js'
import { MODEL_CATALOG } from '../llm/model-capabilities.js'

/**
 * Falha do A/B ao vivo, com causa DISTINGUÍVEL pelo código.
 *
 * Erro tipado e não `throw new Error`: quem chama precisa separar "não havia
 * provider" (fallback delegado, esperado) de "o provider não reportou tokens"
 * (medição impossível, e devolver 0 seria lido como economia total). Uma string
 * solta obriga o chamador a inspecionar mensagem, que muda e quebra em silêncio.
 */
export class LeverAbExecutionError extends McpGraphError {
  constructor(
    readonly code: 'NO_PROVIDER' | 'NO_TOKEN_COUNT',
    message: string,
  ) {
    super(message)
    this.name = 'LeverAbExecutionError'
  }
}

/** Dependências injetadas — o módulo não conhece provider nem CLI (DIP). */
export interface LiveLeverAbDeps {
  /** Transporte do modelo. `null` ⇒ nenhum provider conectado ⇒ delegado. */
  adapter: ModelAdapter | null
  /** Modelo canônico usado nos DOIS braços — comparar modelos diferentes não é A/B. */
  model: string
  /** Rótulo do provider ativo, para atribuição no ledger. */
  provider: string
  costPerInputToken: number
  costPerOutputToken: number
  /**
   * Monta o CORPO da chamada no formato real de produção (chat `messages`).
   *
   * Não é um prompt solto de propósito: o middleware de economia comprime
   * mensagens `role:'tool'`, então um A/B feito sobre uma string única mediria
   * zero — os dois braços sairiam idênticos e o veredito seria vazio por
   * construção. Quem monta o corpo decide o que o lever tem chance de cortar.
   */
  buildBody(task: string): { messages: Array<Record<string, unknown>> }
  /** Raiz do projeto — o middleware resolve o plano de levers a partir dela. */
  rootDir: string
  /** DB do projeto, só para provar que não é escrito. Opcional. */
  projectDb?: Database.Database
}

/**
 * DB de rascunho com o lever do braço ligado/desligado.
 *
 * O middleware lê a config do banco a cada chamada, então este é o ponto de
 * alavanca honesto: em vez de mutar o projeto, damos a ele um banco efêmero que
 * descreve apenas o braço em execução.
 */
export function armLeverConfig(lever: LeverKey, arm: LeverArm): Record<string, { enabled: boolean }> {
  return { [lever]: { enabled: arm === 'on' } }
}

function armConfigDb(lever: LeverKey, arm: LeverArm): Database.Database {
  const db = new Database(':memory:')
  db.exec('CREATE TABLE project_settings (key TEXT PRIMARY KEY, value TEXT)')
  // O middleware grava seus eventos de lever num ledger. Aqui eles morrem com o
  // rascunho de PROPÓSITO: são o auto-reporte do lever sobre si mesmo, e é
  // justamente esse número que não tem autoridade para decidir um default (ver
  // lever-evidence-gate.ts). A autoridade é o total medido de cada braço.
  ensureLeverLedgerTable(db)
  db.prepare('INSERT INTO project_settings (key, value) VALUES (?, ?)').run(
    ECONOMY_LEVERS_SETTING_KEY,
    JSON.stringify(armLeverConfig(lever, arm)),
  )
  return db
}

/**
 * Preço do braço a partir do modelo que REALMENTE respondeu.
 *
 * O custo tem de vir do catálogo do modelo devolvido pelo provider, não de uma
 * constante do chamador: o tier-router pode escolher um modelo diferente do
 * pedido, e cobrar pelo preço do modelo errado produz um número que parece
 * medido e não é. Sem preço catalogado, cai para os coeficientes injetados —
 * explicitamente, para nunca inventar um valor.
 */
function armCostUsd(
  model: string,
  tokensIn: number,
  tokensOut: number,
  deps: Pick<LiveLeverAbDeps, 'costPerInputToken' | 'costPerOutputToken'>,
): number {
  // Pertinência EXPLÍCITA ao catálogo: `getModelCapabilities` devolve um default
  // para modelo desconhecido, e cobrar pelo preço de um modelo que não é o que
  // respondeu produz exatamente o número-que-parece-medido que este épico existe
  // para eliminar.
  const known = Object.hasOwn(MODEL_CATALOG, model)
  if (known) {
    const pricing = MODEL_CATALOG[model].pricingPer1kTokens
    return (tokensIn / 1000) * pricing.input + (tokensOut / 1000) * pricing.output
  }
  return tokensIn * deps.costPerInputToken + tokensOut * deps.costPerOutputToken
}

/** Achata o corpo já processado no prompt que o transporte envia. */
function flattenMessages(messages: Array<Record<string, unknown>>): string {
  return messages.map((m) => String(m.content ?? '')).join('\n')
}

/**
 * Executor vivo para o A/B por lever.
 *
 * `available()` espelha a presença de um transporte real — nunca uma promessa:
 * é ele que decide entre medir de verdade e devolver `delegated` honesto.
 */
export function createLiveLeverAbExecutor(deps: LiveLeverAbDeps): LeverAbExecutor {
  return {
    available(): boolean {
      return deps.adapter != null
    },

    async runArm(lever: LeverKey, arm: LeverArm, task: string): Promise<LeverArmUsage> {
      const adapter = deps.adapter
      if (!adapter) {
        throw new LeverAbExecutionError(
          'NO_PROVIDER',
          'lever A/B: runArm chamado sem provider — cheque available() antes',
        )
      }

      const scratch = armConfigDb(lever, arm)
      try {
        const middleware = createEconomyMiddleware({ db: scratch, rootDir: deps.rootDir })
        // O middleware é a via de produção: o que ele devolver é o que o braço
        // realmente envia, então a diferença ON/OFF é medida e não estimada.
        const body = await middleware(deps.buildBody(task), async (b) => b)
        const res = await adapter.generate({ model: deps.model, prompt: flattenMessages(body.messages) })

        if (res.tokensIn == null || res.tokensOut == null) {
          throw new LeverAbExecutionError(
            'NO_TOKEN_COUNT',
            `lever A/B: provider não reportou contagem de tokens (${deps.provider}/${deps.model}) — ` +
              'sem número medido não há veredito; zero silencioso seria lido como economia total',
          )
        }

        return {
          inputTokens: res.tokensIn,
          outputTokens: res.tokensOut,
          costUsd: armCostUsd(res.model, res.tokensIn, res.tokensOut, deps),
          provider: deps.provider,
          model: res.model,
        }
      } finally {
        scratch.close()
      }
    },
  }
}
