/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * First-Pass Yield — a métrica de ASSERTIVIDADE (F3.T1, node_1bc1477fcb27;
 * contract node_3540f7d7fecc). Retrabalho é a dor nº 1 do desenvolvimento; FPY
 * é a fração de entregas aceitas de PRIMEIRA (Six Sigma), computada sobre os
 * episodic outcomes JÁ gravados (mesma fonte do flow-report — nunca um tracking
 * paralelo). O primeiro outcome por node (o mais antigo por created_at) decide:
 * success de primeira = first-pass; partial/failure de primeira = não.
 *
 * Contrato (node_3540f7d7fecc): value=null quando delivered=0; firstPass ≤
 * delivered sempre. Puro sobre a tabela — testável com :memory:.
 */

import type Database from 'better-sqlite3'

export interface FirstPassYield {
  /** first-pass / delivered ∈ [0,1], ou null quando não houve entrega. */
  value: number | null
  /** Nodes distintos com ≥1 outcome na janela. */
  delivered: number
  /** Nodes cujo primeiro outcome foi success. */
  firstPass: number
  /** Janela avaliada (ms epoch) — from/to. */
  window: { from: number; to: number }
}

export interface FirstPassYieldOptions {
  /** Só considera outcomes dentro de N dias. Ausente = toda a história. */
  maxAgeDays?: number
  /** Injetável p/ teste determinístico da janela. */
  now?: number
}

/**
 * FPY sobre os episodic outcomes. Agrupa por node, pega o outcome mais antigo
 * (o "primeiro passe") e conta quantos foram success. Tabela ausente → vazio.
 */
export function computeFirstPassYield(db: Database.Database, opts: FirstPassYieldOptions = {}): FirstPassYield {
  const now = opts.now ?? Date.now()
  const from = opts.maxAgeDays !== undefined ? now - opts.maxAgeDays * 24 * 3600 * 1000 : 0
  const empty: FirstPassYield = { value: null, delivered: 0, firstPass: 0, window: { from, to: now } }

  let rows: Array<{ nodeId: string; firstOutcome: string }>
  try {
    rows = db
      .prepare(
        `SELECT node_id AS nodeId, outcome AS firstOutcome
         FROM episodic_outcomes eo
         WHERE created_at >= ? AND created_at <= ?
           AND created_at = (
             SELECT MIN(created_at) FROM episodic_outcomes
             WHERE node_id = eo.node_id AND created_at >= ? AND created_at <= ?
           )
         GROUP BY node_id`,
      )
      .all(from, now, from, now) as Array<{ nodeId: string; firstOutcome: string }>
  } catch {
    return empty
  }

  const delivered = rows.length
  if (delivered === 0) return empty
  const firstPass = rows.filter((r) => r.firstOutcome === 'success').length
  return { value: firstPass / delivered, delivered, firstPass, window: { from, to: now } }
}

// ── Gate opcional de FPY (F3.T3, node_7959c7fd81be) ──

export interface FpyGateResult {
  passed: boolean
  code?: 'fpy_below_threshold'
  reason?: string
}

/**
 * Gate opcional de assertividade: reprova quando o FPY da janela cai abaixo do
 * limiar. threshold ≤ 0 = OFF (default do projeto — done byte-idêntico). value
 * null (sem entregas) passa: não há o que cobrar ainda. Puro/determinístico.
 */
export function evaluateFpyGate(fpy: FirstPassYield, threshold: number): FpyGateResult {
  if (threshold <= 0) return { passed: true }
  if (fpy.value === null) return { passed: true }
  if (fpy.value >= threshold) return { passed: true }
  return {
    passed: false,
    code: 'fpy_below_threshold',
    reason: `first-pass yield ${fpy.value.toFixed(2)} < limiar ${threshold.toFixed(2)} (${fpy.firstPass}/${fpy.delivered} de primeira)`,
  }
}
