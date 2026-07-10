/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Resolução ÚNICA do contexto de modelo a partir do projeto + flags + ambiente.
 * Antes, cada comando montava o client à mão e alguns (generate-prd, run) ignoravam
 * o provider/base-url/cache PERSISTIDOS. Centralizar aqui garante que TODOS os
 * caminhos (deliver, generate-prd, run, autopilot/scaffold) respeitem a mesma
 * config — incluindo cache local, base-url de servidor local e effort. DX: um só
 * lugar para "qual modelo/onde/quanto cacheia".
 *
 * Precedência: flag explícita > setting do projeto > ambiente > default (copilot).
 */
import { TieredModelClient } from '../../core/model-hub/model-client.js'
import { resolveProviderAdapter, type ProviderChoice } from '../../core/model-hub/resolve-provider.js'
import { buildResponseCache } from '../../core/model-hub/caching-model-adapter.js'
import { parseFailoverProviders, type FailoverModelAdapter } from '../../core/model-hub/failover-model-adapter.js'
import type { RouterConfig } from '../../core/model-hub/tier-router.js'
import type { SqliteStore } from '../../core/store/sqlite-store.js'

/**
 * Cadeia de failover configurada (stateless), precedência env > setting. Usada
 * tanto para construir o adapter quanto para exibir em `agf status`/`doctor`.
 */
export function resolveFailoverSpecs(
  store: SqliteStore | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Array<{ provider: string; model?: string }> {
  const raw = env.LLM_FAILOVER_CHAIN ?? store?.getProjectSetting('provider_failover') ?? undefined
  return parseFailoverProviders(raw)
}

export interface ProviderContextOpts {
  /** Override de provider (flag CLI), ex.: 'ollama'. */
  provider?: string
  /** Override de base-url (flag CLI) p/ servidor local/remoto. */
  baseUrl?: string
  /** Override de modelo (flag CLI); senão setting 'model' do projeto; senão 'auto'. */
  model?: string
  /** Ambiente (default process.env) — injetável p/ testes. */
  env?: NodeJS.ProcessEnv
}

export interface ProviderContext {
  client: TieredModelClient
  /** providerId quando openai-compatible; undefined p/ Copilot. */
  providerId?: string
  /** Rótulo humano: providerId ou 'copilot'. */
  providerLabel: string
  /** baseURL resolvido (apenas openai-compatible). */
  baseURL?: string
  /** Escolha resolvida (p/ inspeção). */
  choice: ProviderChoice
  /** Cadeia de failover configurada (provider ids), [] se nenhuma. */
  failoverChain: string[]
  /** Adapter de failover vivo (status de fallback na sessão), se configurado. */
  failover?: FailoverModelAdapter
}

/**
 * Constrói o `TieredModelClient` respeitando a config persistida do projeto +
 * flags + env. `store` opcional: comandos one-shot (ex.: `run` fora de projeto)
 * passam `undefined` → cache em memória, sem settings persistidos.
 */
export function buildClientFromProject(
  store: SqliteStore | undefined,
  opts: ProviderContextOpts = {},
): ProviderContext {
  const env = opts.env ?? process.env
  const providerSetting = opts.provider ?? store?.getProjectSetting('provider') ?? env.AGF_PROVIDER ?? undefined
  const baseUrl = opts.baseUrl ?? store?.getProjectSetting('provider_base_url') ?? undefined
  const modelSetting = opts.model ?? store?.getProjectSetting('model') ?? 'auto'
  const config: RouterConfig = modelSetting === 'auto' ? { mode: 'auto' } : { mode: 'pinned', modelId: modelSetting }

  const cache = buildResponseCache(store?.getDb())
  const failoverSpecs = resolveFailoverSpecs(store, env)
  const resolved = resolveProviderAdapter(providerSetting, env, cache, baseUrl, failoverSpecs)
  const providerId = resolved.choice.kind === 'openai-compatible' ? resolved.choice.providerId : undefined
  const baseURL = resolved.choice.kind === 'openai-compatible' ? resolved.choice.baseURL : undefined

  return {
    client: new TieredModelClient(resolved.adapter, config, providerId),
    providerId,
    providerLabel: providerId ?? 'copilot',
    baseURL,
    choice: resolved.choice,
    failoverChain: failoverSpecs.map((s) => (s.model ? `${s.provider}:${s.model}` : s.provider)),
    failover: resolved.failover,
  }
}
