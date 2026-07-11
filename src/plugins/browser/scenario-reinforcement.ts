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
 * Reforça a trilha do domínio a partir do veredito do cenário. passed → deposita
 * (via outcome-reinforcement); failed → 0 (evapora). Retorna o Δτ aplicado.
 */
export function reinforceScenario(deposit: DepositFn, domain: string, verdict: ScenarioVerdict): number {
  return reinforceFromOutcome(deposit, scenarioKey(domain), { success: verdict.verdict === 'passed' })
}
