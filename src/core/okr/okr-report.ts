/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Relatório de OKR por épico (node_6334980fc7eb, épico node_fa33f02975c3) — o
 * payload que `agf okr` renderiza: uma linha por objetivo com o atingimento do
 * KR e o status DERIVADO.
 *
 * PORQUÊ: os épicos passaram a carregar Objetivo+KR, mas nada lia esse outcome —
 * o KR era escrito e nunca medido. Este builder fecha o loop "medir o outcome":
 * lê o KR estruturado (readEpicKr), decide o status com evidência real
 * (computeOkrStatus) e devolve linhas auditáveis (provenance + reason).
 *
 * Compõe, não recria: readEpicKr (src/core/evals/okr-kr-source.ts) +
 * computeOkrStatus (src/core/okr/okr-status.ts). A contagem de entregas vem do
 * VelocityScorecard e o relógio é injetado — puro e testável sem store.
 */

import type { GraphNode } from '../graph/graph-types.js'
import { readEpicKr } from '../evals/okr-kr-source.js'
import { computeOkrStatus } from './okr-status.js'

/** Uma linha do cockpit: um objetivo, seu atingimento e o status derivado. */
export interface OkrRow {
  epicId: string
  /** O objetivo — hoje o título do épico. */
  objective: string
  target: number | null
  current: number | null
  unit: string | null
  /** current/target, ou null quando não há KR estruturado. */
  attainment: number | null
  status: 'on-track' | 'at-risk' | 'no-data'
  /** De onde veio o dado ('metadata' | 'unset') — evidence-by-provenance. */
  provenance: string
  /** Por que este status — auditável. */
  reason: string
}

export interface OkrReportInput {
  /** Nodes candidatos; apenas os do tipo `epic` entram no relatório. */
  epics: readonly GraphNode[]
  /** Tasks entregues na janela (VelocityScorecard.doneTasks). */
  deliveredTasks: number
  /** Relógio injetado (ms epoch) — mantém puro. */
  now: number
  /** Quando true, devolve só o que precisa de atenção (at-risk). */
  atRiskOnly?: boolean
}

/** Lê a deadline do KR estruturado (metadata.kr.deadline), quando houver. */
function readDeadline(node: GraphNode): string | null {
  const kr = (node.metadata as Record<string, unknown> | undefined)?.kr
  if (!kr || typeof kr !== 'object' || Array.isArray(kr)) return null
  const deadline = (kr as Record<string, unknown>).deadline
  return typeof deadline === 'string' ? deadline : null
}

/**
 * Monta uma linha por épico. Épico sem KR estruturado sai com `no-data` +
 * `provenance:'unset'` — a linha APARECE (o cockpit não esconde o objetivo),
 * mas nunca com um status verde que o dado não sustenta.
 */
export function buildOkrReport(input: OkrReportInput): OkrRow[] {
  const rows: OkrRow[] = []

  for (const node of input.epics) {
    if (node.type !== 'epic') continue

    const kr = readEpicKr(node)
    const verdict = computeOkrStatus({
      kr,
      deadline: readDeadline(node),
      startedAt: node.createdAt,
      now: input.now,
      deliveredTasks: input.deliveredTasks,
    })

    rows.push({
      epicId: node.id,
      objective: node.title,
      target: kr.target,
      current: kr.current,
      unit: kr.unit,
      attainment: kr.attainment,
      status: verdict.status,
      provenance: verdict.provenance,
      reason: verdict.reason,
    })
  }

  return input.atRiskOnly === true ? rows.filter((r) => r.status === 'at-risk') : rows
}
