/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Costura de invocação de modelo. O `TieredModelClient` resolve a tarefa para um
 * modelo concreto via tier-router e delega a chamada a um `ModelAdapter`. O
 * adapter real (SDK do GitHub Copilot, via JSON-RPC sobre o Copilot CLI) é
 * plugado por injeção — este módulo não conhece transporte algum.
 */
import {
  resolveOpenRouterModel,
  resolveTierModel,
  routeModelForProvider,
  runCascade,
  type CascadeVerdictLike,
  type ModelTier,
  type RouterConfig,
  type TaskKind,
} from './tier-router.js'
import type { ReasoningEffort } from './effort-router.js'
import type { InternalPhase } from '../lifecycle/phase.js'

/**
 * Cascata viva (node_d2f4062a845f): draft barato → verificador determinístico →
 * escala só se reprovar (FrugalGPT, A.T2). Injetado no cliente: OFF (ausente) ⇒
 * single generate byte-idêntico; ON ⇒ loop sobre `models` (barato→caro). `verify`
 * é o cascade-verifier já ligado às ACs da task (montado no provider-context).
 */
export interface CascadeWire {
  /** Ordem barato→caro (ids de modelo resolvidos). */
  models: readonly string[]
  verify: (text: string) => CascadeVerdictLike
  maxEscalations: number
  onEscalation?: (e: { from: string; to: string; reason: string }) => void
}

export interface ModelRequest {
  /** ID canônico do modelo (do MODEL_POOL). */
  model: string
  prompt: string
  system?: string
  /** Esforço de raciocínio condicional (Frente C). Omitido → comportamento legado. */
  effort?: ReasoningEffort
  /** Imagens como data URLs (visão) — fallback gated; default OCR (0 token). */
  images?: string[]
}

export interface ModelResponse {
  text: string
  model: string
  tokensIn?: number
  tokensOut?: number
  /** Subconjunto de tokensIn que deu cache hit de prefixo (cobrado ~10%). */
  cachedTokensIn?: number
  /** Tokens de raciocínio (output caro) — medição T_reason da Frente C. */
  reasoningTokens?: number
  /** True quando servido do cache local de resposta (0 token, 0 custo). */
  fromCache?: boolean
}

/** Transporte de invocação de um modelo. Implementado pelo adapter do Copilot SDK. */
export interface ModelAdapter {
  generate(request: ModelRequest): Promise<ModelResponse>
}

/**
 * Cliente tiered: dado o tipo de tarefa, roteia para um modelo e invoca o
 * adapter. Mantém o tier-router como única fonte de decisão de modelo.
 */
export class TieredModelClient {
  constructor(
    private readonly adapter: ModelAdapter,
    private readonly config: RouterConfig,
    /** Provider ativo (ex.: 'openrouter') — habilita o tier-map externo no auto. */
    private readonly providerId?: string,
    /** Cascata (lever cascade) — ausente/null = single generate byte-idêntico. */
    private readonly cascade?: CascadeWire | null,
  ) {}

  /** true quando a cascata (lever cascade) está wirada — introspecção p/ ops/testes. */
  hasCascade(): boolean {
    return this.cascade != null
  }

  /** Resolve o modelo para `kind` e gera a resposta via adapter (ou cascata). */
  async run(
    kind: TaskKind,
    prompt: string,
    system?: string,
    phase?: InternalPhase,
    effort?: ReasoningEffort,
    images?: string[],
    learnedTier?: ModelTier,
  ): Promise<ModelResponse> {
    if (this.cascade && this.cascade.models.length > 0) {
      return this.runWithCascade(this.cascade, prompt, system, effort, images)
    }
    const model = this.resolveModel(kind, phase, learnedTier)
    return this.adapter.generate({ model, prompt, system, effort, images })
  }

  /**
   * Laço draft→verify→escalate via {@link runCascade} (DRY — reusa A.T2). Preserva
   * o {@link ModelResponse} COMPLETO do vencedor: `runCascade` devolve só o texto,
   * então mapeamos model→response na chamada e recuperamos pelo `tierUsed`.
   */
  private async runWithCascade(
    cascade: CascadeWire,
    prompt: string,
    system?: string,
    effort?: ReasoningEffort,
    images?: string[],
  ): Promise<ModelResponse> {
    const responses = new Map<string, ModelResponse>()
    const outcome = await runCascade({
      tiers: cascade.models,
      call: async (model: string) => {
        const res = await this.adapter.generate({ model, prompt, system, effort, images })
        responses.set(model, res)
        return { text: res.text }
      },
      verify: cascade.verify,
      maxEscalations: cascade.maxEscalations,
      ...(cascade.onEscalation ? { onEscalation: cascade.onEscalation } : {}),
    })
    return responses.get(outcome.tierUsed) ?? { text: outcome.response, model: outcome.tierUsed }
  }

  /** Modelo que seria usado para uma tarefa (sem invocar). */
  modelFor(kind: TaskKind, phase?: InternalPhase, learnedTier?: ModelTier): string {
    return this.resolveModel(kind, phase, learnedTier)
  }

  /**
   * Resolução de modelo. Quando `learnedTier` é fornecido (lever `learned_routing`
   * ON) e o modo não é `pinned`, honra o tier aprendido respeitando o provider;
   * caso contrário, comportamento legado byte-idêntico via `routeModelForProvider`.
   */
  private resolveModel(kind: TaskKind, phase?: InternalPhase, learnedTier?: ModelTier): string {
    if (learnedTier !== undefined && this.config.mode !== 'pinned') {
      return this.providerId === 'openrouter' ? resolveOpenRouterModel(learnedTier) : resolveTierModel(learnedTier)
    }
    return routeModelForProvider(this.config, kind, this.providerId, phase)
  }
}
