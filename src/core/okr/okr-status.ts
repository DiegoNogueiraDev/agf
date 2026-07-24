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
 * Guardas de suficiência: há evidência para julgar este KR? Devolve o veredito
 * de `no-data` quando não há, ou `null` para seguir adiante. Separado do
 * julgamento porque são perguntas diferentes — "posso opinar?" antes de "qual
 * é a opinião?" —, e é essa ordem que impede ausência de virar verde.
 */
function insufficientEvidence(kr: KrRecord, deliveredTasks: number): OkrStatusVerdict | { attainment: number } {
  if (kr.status !== 'ok' || kr.attainment === null || kr.provenance === 'unset') {
    return noData(kr.provenance, 'KR sem fonte estruturada (metadata.kr ausente ou não-numérico)')
  }
  if (deliveredTasks <= 0) {
    return noData(kr.provenance, 'histórico insuficiente: nenhuma task entregue na janela')
  }
  // Devolve o attainment já estreitado em vez de `null`: quem chama recebe um
  // número de verdade, sem precisar reafirmar com um cast o que esta função
  // acabou de provar.
  return { attainment: kr.attainment }
}

/**
 * Julga o ritmo contra o horizonte. Só é chamado depois que a suficiência
 * passou, então `attainment` já é um número e a proveniência é real.
 */
function judgeByPace(
  kr: KrRecord,
  attainment: number,
  deadline: string | null | undefined,
  startedAt: string | null | undefined,
  now: number,
): OkrStatusVerdict {
  const deadlineMs = toMs(deadline)
  const startedMs = toMs(startedAt)

  // Prazo vencido sem atingir o alvo: at-risk, jamais on-track. Vem ANTES da
  // régua porque não é preciso saber quando a janela começou para saber que o
  // fim passou — exigir a âncora aqui condenava épicos sem `createdAt` a
  // `no-data` permanente, esvaziando o filtro `--at-risk`.
  if (deadlineMs !== null && now >= deadlineMs) {
    return {
      status: 'at-risk',
      provenance: kr.provenance,
      reason: `deadline vencida com attainment ${attainment} < 1`,
    }
  }

  // A régua linear exige um horizonte completo; sem ele, o honesto é não saber.
  if (deadlineMs === null || startedMs === null || deadlineMs <= startedMs) {
    return noData(kr.provenance, 'sem deadline/início válidos e sem projeção — ritmo não é julgável')
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

/**
 * Decide o status do KR a partir de evidência real. Ordem importa: a
 * suficiência é checada ANTES de qualquer caminho que possa devolver
 * 'on-track', para que ausência de dado nunca vire verde.
 */
export function computeOkrStatus(input: OkrStatusInput): OkrStatusVerdict {
  const { kr, now, deliveredTasks, projectedAttainment } = input

  const evidence = insufficientEvidence(kr, deliveredTasks)
  if ('status' in evidence) return evidence
  const { attainment } = evidence

  // Alvo já atingido — evidência direta, dispensa projeção.
  if (attainment >= 1) {
    return { status: 'on-track', provenance: kr.provenance, reason: `KR atingido (attainment ${attainment})` }
  }

  // A projeção do forecast, quando existe, é a evidência mais forte de ritmo.
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

  return judgeByPace(kr, attainment, input.deadline, input.startedAt, now)
}
