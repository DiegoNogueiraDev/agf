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
import { TieredModelClient, type CascadeWire } from './model-client.js'
import { resolveCascadePolicy, effectiveCascadeTiers } from './cascade-policy.js'
import { resolveOpenRouterModel, resolveTierModel, type ModelTier } from './tier-router.js'
import { verifyCascadeResponse } from '../llm/cascade-verifier.js'
import { recordTierEscalation } from '../observability/llm-call-ledger.js'
import type Database from 'better-sqlite3'
import { resolveProviderAdapter, type ProviderChoice } from './resolve-provider.js'
import { buildResponseCache, resolveSemanticCacheWire } from './caching-model-adapter.js'
import { currentTaskId } from '../economy/attribution.js'
import { parseFailoverProviders, type FailoverModelAdapter } from './failover-model-adapter.js'
import type { RouterConfig } from './tier-router.js'
import type { SqliteStore } from '../store/sqlite-store.js'

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
  // Cache semântico (lever semantic_cache, default-OFF) escopado ao node ativo:
  // OFF ⇒ wire null ⇒ caminho byte-idêntico; ON ⇒ hit por similaridade da task atual.
  const db = store?.getDb()
  const semantic = db ? resolveSemanticCacheWire(store!, db, { nodeId: currentTaskId(db) ?? undefined }) : null
  const resolved = resolveProviderAdapter(providerSetting, env, cache, baseUrl, failoverSpecs, semantic)
  const providerId = resolved.choice.kind === 'openai-compatible' ? resolved.choice.providerId : undefined
  const baseURL = resolved.choice.kind === 'openai-compatible' ? resolved.choice.baseURL : undefined

  // Cascata FrugalGPT (lever cascade, default-OFF): draft barato → verifica c/ as
  // ACs do node ativo → escala só se reprovar. OFF ⇒ wire null ⇒ byte-idêntico.
  const cascade = store && db ? buildCascadeWire(store, db, providerId) : null

  return {
    client: new TieredModelClient(resolved.adapter, config, providerId, cascade),
    providerId,
    providerLabel: providerId ?? 'copilot',
    baseURL,
    choice: resolved.choice,
    failoverChain: failoverSpecs.map((s) => (s.model ? `${s.provider}:${s.model}` : s.provider)),
    failover: resolved.failover,
  }
}

/**
 * Monta o {@link CascadeWire} a partir da lever `cascade` (default-OFF ⇒ null =
 * byte-idêntico). Resolve tier→modelo pelo provider ativo, liga o verificador às
 * ACs do node in_progress e grava cada escalada no ledger (rescue-rate). O
 * verificador roda sobre a resposta LIVRE do modelo — AC-keyword coverage é a
 * lente correta aqui (diferente do submit, cujo resultado é JSON estruturado).
 */
export function buildCascadeWire(store: SqliteStore, db: Database.Database, providerId?: string): CascadeWire | null {
  const policy = resolveCascadePolicy(store)
  if (!policy) return null
  const nodeId = currentTaskId(db)
  const node = nodeId ? store.getNodeById(nodeId) : null
  const acLines = (node?.acceptanceCriteria as string[] | undefined) ?? []
  // Regra determinística complexidade→tier: L/XL começa frontier-first (pula o
  // draft barato); XS/S/M e xpSize ausente/inválido = lista completa (byte-idêntico).
  const tiers = effectiveCascadeTiers(policy.tiers, node?.xpSize)
  const models = tiers.map((t) =>
    providerId === 'openrouter' ? resolveOpenRouterModel(t as ModelTier) : resolveTierModel(t as ModelTier),
  )
  return {
    models,
    verify: (text: string) => verifyCascadeResponse(text, { acLines, expectJson: false, threshold: policy.threshold }),
    maxEscalations: policy.maxEscalations,
    onEscalation: (e) => {
      try {
        recordTierEscalation(db, {
          sessionId: 'cascade',
          nodeId: nodeId ?? undefined,
          from: e.from,
          to: e.to,
          reason: e.reason,
        })
      } catch {
        // ledger nunca quebra o caminho de geração
      }
    },
  }
}
