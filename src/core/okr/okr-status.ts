/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Status do KR — on-track | at-risk | no-data (node_b1918a5a4643, épico
 * node_fa33f02975c3; CONTRACT node_62b00f3381b8).
 *
 * PORQUÊ: o cockpit de OKR só vale se o status for DERIVADO de dado real. Um
 * "on-track" inventado é pior que nenhum status — é o falso-verde que a épica
 * de certeza existe para matar, aplicado ao outcome. Por isso a regra do
 * contrato (evidence-by-provenance) é absoluta: **KR sem fonte, ou histórico
 * insuficiente, ⇒ 'no-data' — NUNCA 'on-track'**.
 *
 * Consome o que já existe (não recria métrica): `KrRecord`
 * (src/core/evals/okr-kr-source.ts) traz attainment+provenance; a contagem de
 * entregas vem do VelocityScorecard (src/core/evals/scorecard.ts) e a projeção
 * opcional do monte-carlo (src/core/insights/monte-carlo-forecast.ts). Puro: o
 * relógio (`now`) é injetado, então é testável sem esperar o tempo passar.
 */

import type { KrRecord } from '../evals/okr-kr-source.js'

/** Entrada do cálculo — tudo já medido por outros módulos; aqui só se decide. */
export interface OkrStatusInput {
  /** KR normalizado do épico (attainment + provenance). */
  kr: KrRecord
  /** Prazo do KR (ISO). Sem prazo e sem projeção não há como julgar ritmo. */
  deadline?: string | null
  /** Início da janela (ISO) — âncora da régua de ritmo. */
  startedAt?: string | null
  /** Relógio injetado (ms epoch) — mantém a função pura. */
  now: number
  /** Tasks entregues na janela (VelocityScorecard.doneTasks) — suficiência de histórico. */
  deliveredTasks: number
  /** Atingimento projetado pelo forecast (1 = alcança o alvo). Vence a régua linear. */
  projectedAttainment?: number | null
}

/** Veredito do status + de onde ele veio. */
export interface OkrStatusVerdict {
  status: 'on-track' | 'at-risk' | 'no-data'
  /** Provenance do KR que sustentou a decisão ('unset' quando não há fonte). */
  provenance: string
  /** Por que este status — auditável, nunca um rótulo solto. */
  reason: string
}

function noData(provenance: string, reason: string): OkrStatusVerdict {
  return { status: 'no-data', provenance, reason }
}

/** Parse ISO → ms, ou null quando ausente/inválido. */
function toMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : null
}

/**
 * Decide o status do KR a partir de evidência real. Ordem das guardas importa:
 * as de `no-data` vêm ANTES de qualquer caminho que possa devolver 'on-track',
 * para que ausência de dado nunca vire verde.
 */
export function computeOkrStatus(input: OkrStatusInput): OkrStatusVerdict {
  const { kr, now, deliveredTasks, projectedAttainment } = input

  // 1. KR sem fonte estruturada ⇒ no-data (regra do contrato).
  if (kr.status !== 'ok' || kr.attainment === null || kr.provenance === 'unset') {
    return noData(kr.provenance, 'KR sem fonte estruturada (metadata.kr ausente ou não-numérico)')
  }

  // 2. Sem entregas na janela não há ritmo observável ⇒ no-data.
  if (deliveredTasks <= 0) {
    return noData(kr.provenance, 'histórico insuficiente: nenhuma task entregue na janela')
  }

  const attainment = kr.attainment

  // 3. Alvo já atingido — evidência direta, dispensa projeção.
  if (attainment >= 1) {
    return { status: 'on-track', provenance: kr.provenance, reason: `KR atingido (attainment ${attainment})` }
  }

  // 4. Projeção do forecast, quando existe, é a evidência mais forte de ritmo.
  if (projectedAttainment !== undefined && projectedAttainment !== null) {
    return projectedAttainment >= 1
      ? {
          status: 'on-track',
          provenance: kr.provenance,
          reason: `forecast projeta atingir o alvo (projeção ${projectedAttainment})`,
        }
      : {
          status: 'at-risk',
          provenance: kr.provenance,
          reason: `forecast projeta ${projectedAttainment} < 1 até a deadline`,
        }
  }

  // 5. Régua linear de ritmo: só é possível com um horizonte (início + deadline).
  const deadlineMs = toMs(input.deadline)
  const startedMs = toMs(input.startedAt)
  if (deadlineMs === null || startedMs === null || deadlineMs <= startedMs) {
    return noData(kr.provenance, 'sem deadline/início válidos e sem projeção — ritmo não é julgável')
  }

  // Prazo vencido sem atingir o alvo: at-risk, jamais on-track.
  if (now >= deadlineMs) {
    return {
      status: 'at-risk',
      provenance: kr.provenance,
      reason: `deadline vencida com attainment ${attainment} < 1`,
    }
  }

  const elapsedFraction = (now - startedMs) / (deadlineMs - startedMs)
  return attainment >= elapsedFraction
    ? {
        status: 'on-track',
        provenance: kr.provenance,
        reason: `attainment ${attainment} ≥ fração de prazo decorrida ${elapsedFraction.toFixed(2)}`,
      }
    : {
        status: 'at-risk',
        provenance: kr.provenance,
        reason: `attainment ${attainment} < fração de prazo decorrida ${elapsedFraction.toFixed(2)}`,
      }
}
