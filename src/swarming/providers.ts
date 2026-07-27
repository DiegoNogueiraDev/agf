/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * ant-swarming providers — superfície de config de provider da formiga.
 *
 * PORQUÊ: "fácil configurar providers" é o requisito nº 1 do dono — a formiga só
 * ocupa um provider barato se a config for trivial. Este módulo REUSA os donos do
 * agf (do not recreate): provider-registry (lista + env var de cada provider),
 * caste-taxonomy (casta→tier), tier-router (tier→model), e persiste no MESMO
 * project_settings que `agf provider use` — fonte única, zero duplicação.
 *
 * ISOLAMENTO: importa SÓ de core (nunca ../cli/../tui). Puro/testável: `doctor`
 * é um builder de relatório sobre um env injetado; `use` delega ao store.
 */

import type { SqliteStore } from '../core/store/sqlite-store.js'
import { listProviders, resolveProviderConfig } from '../core/model-hub/provider-registry.js'
import { listCastes } from '../core/colony/caste-taxonomy.js'
import { MODEL_POOL, resolveOpenRouterModel, DEFAULT_MODEL, type ModelTier } from '../core/model-hub/tier-router.js'

/** Chave de config compartilhada com o agf (`agf provider use` grava aqui). */
const PROVIDER_SETTING = 'provider'

export interface DetectedProvider {
  id: string
  label: string
  /** Env var que o habilita (vazia p/ providers locais sem chave, ex.: ollama). */
  envVar: string
}

export interface CasteRoute {
  caste: string
  tier: ModelTier
  model: string
}

export interface MissingProviders {
  hint: string
  /** Nomes EXATOS das env vars aceitas (uma delas destrava o modo autônomo). */
  acceptedEnvVars: string[]
}

export interface DoctorReport {
  detected: DetectedProvider[]
  castes: CasteRoute[]
  /** Presente só quando nenhum provider com chave está configurado. */
  missing?: MissingProviders
}

/** Providers cuja chave (env var) está presente no env dado, ou que não exigem chave. */
function detectProviders(env: NodeJS.ProcessEnv): DetectedProvider[] {
  const detected: DetectedProvider[] = []
  for (const id of listProviders()) {
    const cfg = resolveProviderConfig(id)
    if (!cfg) continue
    const hasKey = cfg.requiresKey ? Boolean(env[cfg.envVar]) : true
    if (hasKey) detected.push({ id: cfg.id, label: cfg.label, envVar: cfg.envVar })
  }
  return detected
}

/** Resolve um tier para um model concreto — openrouter quando detectado, senão o pool default. */
function modelForTier(tier: ModelTier, preferOpenRouter: boolean): string {
  if (preferOpenRouter) return resolveOpenRouterModel(tier)
  return MODEL_POOL.find((m) => m.tier === tier)?.id ?? DEFAULT_MODEL
}

/**
 * Diagnóstico de providers: (a) detectados, (b) casta→tier→model p/ as 4 castas,
 * (c) env vars aceitas quando nada configurado. É diagnóstico (nunca falha): o
 * chamador emite exit 0 e decide como mostrar. Env injetável → 100% testável.
 */
export function buildDoctorReport(env: NodeJS.ProcessEnv = process.env): DoctorReport {
  const detected = detectProviders(env)
  const keyedProviders = detected.filter((d) => d.envVar) // exclui locais sem chave
  const preferOpenRouter = keyedProviders.some((d) => d.id === 'openrouter')

  const castes: CasteRoute[] = listCastes().map((c) => ({
    caste: c.caste,
    tier: c.model_tier,
    model: modelForTier(c.model_tier, preferOpenRouter),
  }))

  const report: DoctorReport = { detected, castes }
  if (keyedProviders.length === 0) {
    const acceptedEnvVars = listProviders()
      .map((id) => resolveProviderConfig(id)?.envVar)
      .filter((v): v is string => Boolean(v))
    report.missing = {
      hint: 'Nenhum provider com chave configurado — exporte uma das env vars abaixo e rode `ant-swarming providers use <id>`.',
      acceptedEnvVars,
    }
  }
  return report
}

/** Persiste o provider ativo no MESMO project_settings que o agf lê (fonte única). */
export function useProvider(store: SqliteStore, id: string): { provider: string } {
  store.setProjectSetting(PROVIDER_SETTING, id)
  return { provider: id }
}

/** Lista os providers do registry com o flag de detecção (para `providers list`). */
export function listProvidersReport(env: NodeJS.ProcessEnv = process.env): {
  providers: Array<{ id: string; label: string; detected: boolean; envVar: string }>
} {
  const detectedIds = new Set(detectProviders(env).map((d) => d.id))
  const providers = listProviders().map((id) => {
    const cfg = resolveProviderConfig(id)
    return {
      id,
      label: cfg?.label ?? id,
      detected: detectedIds.has(id),
      envVar: cfg?.envVar ?? '',
    }
  })
  return { providers }
}
