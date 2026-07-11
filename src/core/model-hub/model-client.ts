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
  type ModelTier,
  type RouterConfig,
  type TaskKind,
} from './tier-router.js'
import type { ReasoningEffort } from './effort-router.js'
import type { InternalPhase } from '../lifecycle/phase.js'

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
  ) {}

  /** Resolve o modelo para `kind` e gera a resposta via adapter. */
  async run(
    kind: TaskKind,
    prompt: string,
    system?: string,
    phase?: InternalPhase,
    effort?: ReasoningEffort,
    images?: string[],
    learnedTier?: ModelTier,
  ): Promise<ModelResponse> {
    const model = this.resolveModel(kind, phase, learnedTier)
    return this.adapter.generate({ model, prompt, system, effort, images })
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
