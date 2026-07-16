/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Roteador de esforço de raciocínio (alavanca de esforço condicional). Output é o lado caro
 * (≈2× o input) e tokens de raciocínio SÃO output. A literatura de efficient
 * reasoning (UnCert-CoT, Zhu et al. 2025) converge num princípio: acionar
 * raciocínio longo SÓ sob incerteza alta; default no esforço mínimo.
 *
 * Regra de ouro: a decisão de roteamento NÃO pode custar caro — heurística
 * determinística sobre metadados (tipo de tarefa, tentativa, reuso), NUNCA um
 * segundo LLM em esforço alto deliberando sobre qual esforço usar. Este módulo é
 * puro e zero-dep: classificar o esforço custa zero token.
 */
import type { TaskKind } from './tier-router.js'

/** Níveis de esforço, do mais barato (menos output) ao mais caro. */
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high'

/** Sinais BARATOS (metadados já em mãos) que guiam o esforço. Nenhum custa token. */
export interface EffortSignals {
  /** Tipo da tarefa (mapeia tier; classify/status são triviais). */
  kind: TaskKind
  /** Tentativa 1-based. Retry após vermelho = sinal de incerteza → escala. */
  attempt?: number
  /** Há scaffold/edits de reuso? Template em mãos → menos raciocínio na 1ª. */
  hasReuse?: boolean
}

/**
 * Escolhe o esforço de raciocínio por heurística determinística (0 token).
 *
 * - `classify`/`status` (tier cheap): decisão trivial → `minimal`.
 * - `plan` (tier frontier): síntese/decomposição → `high` (raciocínio genuíno).
 * - `implement`/`review` 1ª tentativa: `minimal` se há reuso (template), senão `low`.
 * - Retry (attempt ≥ 2): o teste vermelho É a incerteza (UnCert-CoT) → escala
 *   `medium` (2ª) e `high` (≥ 3ª), independentemente de ter havido reuso.
 */
export function chooseEffort(signals: EffortSignals): ReasoningEffort {
  const attempt = signals.attempt ?? 1

  // Tarefas baratas: julgamento fechado, sem overthinking.
  if (signals.kind === 'classify' || signals.kind === 'status') return 'minimal'

  // Planejar/decompor/sintetizar: raciocínio é o trabalho insubstituível.
  if (signals.kind === 'plan') return 'high'

  // Retry: cada vermelho sobe a aposta de raciocínio (incerteza comprovada).
  if (attempt >= 3) return 'high'
  if (attempt === 2) return 'medium'

  // 1ª tentativa de implement/review: template em mãos corta o raciocínio.
  return signals.hasReuse ? 'minimal' : 'low'
}

/**
 * Mapeia o esforço interno para o enum aceito no fio. A API do OpenRouter expõe
 * `low|medium|high` (não há `minimal`), então `minimal` colapsa em `low` — ainda
 * o piso de raciocínio. Modelos não-reasoning (ex.: deepseek-chat) ignoram o campo.
 */
export function effortToWire(effort: ReasoningEffort): 'low' | 'medium' | 'high' {
  return effort === 'minimal' ? 'low' : effort
}
