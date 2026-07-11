/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_9014fcbe32e8 — Seleção de provider. `selectProvider` é pura: decide
 * entre Copilot (default) e um endpoint OpenAI-compatible quando configurado e
 * com chave disponível. Sem config / sem chave / provider desconhecido (inclui
 * anthropic, excluído) → cai para Copilot — contrato de não-regressão.
 */
import { OpenAICompatibleAdapter } from './openai-compatible-adapter.js'
import { resolveModelAdapter } from './resolve-adapter.js'
import { resolveProviderConfig } from './provider-registry.js'
import { CachingModelAdapter, responseCacheEnabled } from './caching-model-adapter.js'
import { FailoverModelAdapter, type FailoverTarget } from './failover-model-adapter.js'
import { cacheOrchestrator } from '../cache/cache-orchestrator.js'
import type { ResponseCache } from '../llm/response-cache.js'
import type { ModelAdapter, ModelResponse } from './model-client.js'

/** Entrada de failover: provider + modelo opcional (override no fallback). */
export interface FailoverSpec {
  provider: string
  model?: string
}

export type ProviderChoice =
  { kind: 'copilot' } | { kind: 'openai-compatible'; providerId: string; baseURL: string; apiKey?: string }

type Env = Record<string, string | undefined>

/**
 * Resolve o baseURL com precedência: env `<ID>_BASE_URL` (escape de sessão) >
 * setting persistido (CLI/TUI: `provider use <id> --base-url`) > registry. Permite
 * apontar a camada a um servidor local/remoto (modelo local = 0 token de custo)
 * sem editar o registry. Vazio em todos → baseURL do registry.
 */
function resolveBaseURL(cfg: { id: string; baseURL: string }, env: Env, persisted?: string | null): string {
  const envOverride = env[`${cfg.id.toUpperCase()}_BASE_URL`]
  if (envOverride && envOverride.trim()) return envOverride.trim()
  if (persisted && persisted.trim()) return persisted.trim()
  return cfg.baseURL
}

/**
 * Decide o provider a partir do setting + ambiente. Pura. `baseUrlOverride` é o
 * valor persistido pelo projeto (setting `provider_base_url`); env ainda vence.
 */
export function selectProvider(
  providerSetting: string | null | undefined,
  env: Env,
  baseUrlOverride?: string | null,
): ProviderChoice {
  if (!providerSetting) return { kind: 'copilot' }
  const cfg = resolveProviderConfig(providerSetting)
  if (!cfg) return { kind: 'copilot' } // desconhecido/excluído (anthropic) → default
  const baseURL = resolveBaseURL(cfg, env, baseUrlOverride)
  if (cfg.requiresKey) {
    const apiKey = cfg.envVar ? env[cfg.envVar] : undefined
    if (!apiKey) return { kind: 'copilot' } // sem chave → não quebra, usa Copilot
    return { kind: 'openai-compatible', providerId: cfg.id, baseURL, apiKey }
  }
  // Endpoints locais (ex.: Ollama) não exigem chave.
  return { kind: 'openai-compatible', providerId: cfg.id, baseURL }
}

/** Constrói o ModelAdapter para a escolha. */
export function buildProviderAdapter(choice: ProviderChoice, env: Env = process.env): ModelAdapter {
  if (choice.kind === 'openai-compatible') {
    // OpenRouter: liga o Response Caching server-side deles (grátis em requisições
    // idênticas dentro do TTL). Complementa o cache LOCAL persistente. Kill-switch
    // `AGF_OPENROUTER_CACHE=0`.
    const extraHeaders =
      choice.providerId === 'openrouter' && env.AGF_OPENROUTER_CACHE !== '0'
        ? { 'X-OpenRouter-Cache': 'true' }
        : undefined
    // Estilo de reasoning por provider: OpenRouter (reasoning.effort), OpenAI
    // (reasoning_effort), demais (Ollama/Groq/Cerebras) não suportam → none.
    const reasoningStyle =
      choice.providerId === 'openrouter' ? 'openrouter' : choice.providerId === 'openai' ? 'openai' : 'none'
    return new OpenAICompatibleAdapter({
      baseURL: choice.baseURL,
      apiKey: choice.apiKey,
      provider: choice.providerId,
      extraHeaders,
      reasoningStyle,
    })
  }
  return resolveModelAdapter().adapter
}

/**
 * Conveniência: resolve a escolha e já constrói o adapter. Quando `cache` é
 * fornecido e o kill-switch não desliga, embrulha num `CachingModelAdapter`
 * (cache local de resposta, provider-agnóstico) e o registra no `cacheOrchestrator`
 * para o `/cache-stats`. Sem `cache` → comportamento legado intacto.
 */
export function resolveProviderAdapter(
  providerSetting: string | null | undefined,
  env: Env = process.env,
  cache?: ResponseCache<ModelResponse>,
  baseUrlOverride?: string | null,
  failover?: ReadonlyArray<FailoverSpec>,
): { adapter: ModelAdapter; choice: ProviderChoice; failover?: FailoverModelAdapter } {
  const choice = selectProvider(providerSetting, env, baseUrlOverride)
  let adapter = buildProviderAdapter(choice, env)
  const primaryId = choice.kind === 'openai-compatible' ? choice.providerId : 'copilot'

  // Failover (opt-in): cadeia ordenada de providers; cai para o próximo em erro.
  // Fica POR DENTRO do cache (cache primeiro → hit evita todos os providers).
  let failoverAdapter: FailoverModelAdapter | undefined
  if (failover && failover.length > 0) {
    const targets: FailoverTarget[] = [{ providerId: primaryId, adapter }]
    for (const spec of failover) {
      const c = selectProvider(spec.provider, env)
      targets.push({ providerId: spec.provider, adapter: buildProviderAdapter(c, env), model: spec.model })
    }
    failoverAdapter = new FailoverModelAdapter(targets)
    adapter = failoverAdapter
  }

  if (cache && responseCacheEnabled(env)) {
    const caching = new CachingModelAdapter(adapter, cache, { providerId: primaryId })
    cacheOrchestrator.register(caching.asCacheRegistration())
    adapter = caching
  }
  return { adapter, choice, failover: failoverAdapter }
}
