/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * collectOkrRows — a ÚNICA composição do cockpit de OKR.
 *
 * WHY: o relatório nasce de duas fontes (os épicos do grafo + as entregas do
 * VelocityScorecard) e de um relógio injetado. Enquanto essa costura vivia
 * dentro do `okr-cmd`, qualquer segunda superfície (a rota HTTP, uma aba, um
 * export) teria de repeti-la — e duas cópias divergem calado: o terminal e o
 * dashboard passariam a afirmar atingimentos diferentes do MESMO épico, cada
 * um verde no seu próprio teste. Aqui a composição é uma só; as superfícies
 * apenas a apresentam.
 *
 * Contrato: devolve as linhas JÁ agregadas (count/atRisk/noData) porque os
 * dois consumidores precisam exatamente desses totais. Um scorecard
 * indisponível vira 0 entregas — e 0 entregas cai em `no-data`, nunca num
 * verde sem lastro.
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import { buildOkrReport, type OkrRow } from './okr-report.js'
import { collectVelocityScorecard } from '../evals/scorecard.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'okr-collect.ts' })

export interface CollectOkrOptions {
  /** Relógio injetado (ms epoch) — mantém o builder puro e testável. */
  now: number
  /** Quando true, devolve só o que precisa de atenção (at-risk). */
  atRiskOnly?: boolean
}

export interface OkrCollection {
  rows: OkrRow[]
  count: number
  atRisk: number
  noData: number
}

/** Colhe as linhas do cockpit de OKR a partir de um store vivo. */
export function collectOkrRows(store: SqliteStore, options: CollectOkrOptions): OkrCollection {
  const rows = buildOkrReport({
    epics: store.toGraphDocument().nodes,
    deliveredTasks: safeDeliveredTasks(store),
    now: options.now,
    atRiskOnly: options.atRiskOnly === true,
  })

  return {
    rows,
    count: rows.length,
    atRisk: rows.filter((r) => r.status === 'at-risk').length,
    noData: rows.filter((r) => r.status === 'no-data').length,
  }
}

/**
 * Entregas da janela. O scorecard é uma dependência opcional do cockpit: sem
 * ele o relatório ainda vale (os KRs estruturados seguem legíveis), então a
 * falha degrada para 0 em vez de derrubar a superfície inteira.
 */
function safeDeliveredTasks(store: SqliteStore): number {
  try {
    return collectVelocityScorecard(store).doneTasks
  } catch (err) {
    log.warn(`velocity scorecard unavailable: ${err instanceof Error ? err.message : String(err)}`)
    return 0
  }
}
