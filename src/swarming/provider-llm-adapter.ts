/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * provider-llm-adapter (node_b4b1674b6b61, Swarm-B) — o adapter ASYNC que
 * fecha o honesty-gotcha da colônia: makeLlm() devolve um AntLlmPort real
 * chamando o MESMO gateway tiered do --live (TieredModelClient via
 * buildClientFromProject — nunca uma segunda chamada a SDK de provider, DIP).
 * O tier da casta entra como `learnedTier` do client.run, que resolve o
 * modelo pelo tier-router; usage é mapeado para {inputTokens, outputTokens}
 * (0 quando o provider não reporta — nunca NaN). Erros do provider viram
 * ProviderLlmError tipado com a classificação de classifyLlmError.
 *
 * Consumidores: ant-runner.ts (runAntCycle) / run.ts do swarming.
 */

import type { SqliteStore } from '../core/store/sqlite-store.js'
import type { ModelResponse } from '../core/model-hub/model-client.js'
import { classifyLlmError, type LlmErrorKind } from '../core/model-hub/llm-error.js'
import { buildClientFromProject } from '../core/model-hub/provider-context.js'
import { GraphError } from '../core/errors/graph-error.js'
import type { AntLlmPort } from './ant-runner.js'
import type { ModelTier } from '../core/colony/task-caste.js'

/** Erro de provider já classificado — propaga tratado, nunca crash cru (AC3). */
export class ProviderLlmError extends GraphError {
  constructor(
    message: string,
    readonly kind: LlmErrorKind,
    readonly retryable: boolean,
    readonly retryAfterMs?: number,
  ) {
    super(message)
    this.name = 'ProviderLlmError'
  }
}

/**
 * Subconjunto do TieredModelClient que o adapter usa — injetável p/ teste
 * (stub com contador, padrão do brief) sem carregar o SDK real.
 */
export interface TieredRunClient {
  run(
    kind: 'implement',
    prompt: string,
    system?: string,
    phase?: undefined,
    effort?: undefined,
    images?: string[],
    learnedTier?: ModelTier,
  ): Promise<ModelResponse>
}

export interface MakeLlmOptions {
  /** Client injetado (teste/reuso). Ausente ⇒ constrói do projeto (gateway real). */
  client?: TieredRunClient
  /** Store do projeto p/ settings de provider (só usado sem `client`). */
  store?: SqliteStore
  /** Overrides equivalentes às flags do --live (só usados sem `client`). */
  provider?: string
  baseUrl?: string
  model?: string
}

/**
 * Constrói o AntLlmPort async sobre o gateway tiered existente. Toda task da
 * formiga roda como TaskKind 'implement'; o tier roteado pela casta vai como
 * learnedTier — o tier-router continua a única fonte de decisão de modelo.
 */
export function makeLlm(opts: MakeLlmOptions = {}): AntLlmPort {
  let client: TieredRunClient
  let providerLabel: string
  if (opts.client) {
    client = opts.client
    providerLabel = opts.provider ?? 'injected'
  } else {
    const ctx = buildClientFromProject(opts.store, {
      provider: opts.provider,
      baseUrl: opts.baseUrl,
      model: opts.model,
    })
    client = ctx.client
    providerLabel = ctx.providerLabel
  }

  return {
    async run(input: { tier: ModelTier; prompt: string; nodeId: string }) {
      let res: ModelResponse
      try {
        res = await client.run('implement', input.prompt, undefined, undefined, undefined, undefined, input.tier)
      } catch (err) {
        const cls = classifyLlmError(err)
        const message = err instanceof Error ? err.message : String(err)
        throw new ProviderLlmError(message, cls.kind, cls.retryable, cls.retryAfterMs)
      }
      return {
        text: res.text,
        inputTokens: res.tokensIn ?? 0,
        outputTokens: res.tokensOut ?? 0,
        provider: providerLabel,
        model: res.model,
      }
    },
  }
}
