/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §PRD-0200-RPA — Task 4.2: Loop de reforço ACO cross-domínio.
 *
 * Liga o veredito de um cenário RPA (scenario-oracle) à mesma colônia/feromônio
 * que o ciclo SWE usa (outcome-reinforcement) — reforço CROSS-DOMÍNIO: cenários
 * que passam reforçam a trilha do seu domínio; falhas não depositam (evaporam).
 * Composição de peças existentes; pura/injetável. Não-pivota.
 */

import { reinforceFromOutcome, type DepositFn } from '../../core/colony/outcome-reinforcement.js'
import type { ScenarioVerdict } from './scenario-oracle.js'

/** Chave de trilha de feromônio por domínio do cenário (cross-domínio com o SWE). */
export function scenarioKey(domain: string): string {
  return `scenario:domain:${domain.toLowerCase()}`
}

/**
 * Reforça a trilha do domínio a partir do veredito do cenário. Três-vias explícito
 * (node_0abd1bc7132e §5 ressalvas): `inconclusive` (e qualquer veredito desconhecido)
 * é uma leitura NÃO-CONFIÁVEL — não é sinal, NUNCA deposita, e sai ANTES do mapeamento
 * de sucesso, para não herdar um eventual reforço negativo de `failed` no futuro (hoje
 * a convenção do pheromone-store é sem negativo, então failed também evapora). `passed`
 * → deposita; `failed` → 0 (evapora). Retorna o Δτ aplicado. Blinda a colônia contra
 * feromônio depositado em trilha fantasma (falso-positivo por leitura mentirosa).
 */
export function reinforceScenario(deposit: DepositFn, domain: string, verdict: ScenarioVerdict): number {
  if (verdict.verdict !== 'passed' && verdict.verdict !== 'failed') return 0
  return reinforceFromOutcome(deposit, scenarioKey(domain), { success: verdict.verdict === 'passed' })
}
