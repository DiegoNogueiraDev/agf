/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Persistência do veredito de cenário por nodeId (node_a0e28320fe6b, épico
 * node_56a63da5d5c8).
 *
 * PORQUÊ: `agf scenario` roda cada cenário num `:memory:` próprio (scenario-cmd)
 * e nada sobrevive ao processo — então `check`/`done` não têm veredito de
 * SUPERFÍCIE para ler, e um gate sem evidência só pode adivinhar. Adivinhar
 * verde é justamente o falso-passed que o épico existe para matar.
 *
 * Regra dura (ausência ≠ aprovação): sem run registrado, o estado é `missing`,
 * NUNCA `passed`. E vale sempre o veredito MAIS RECENTE — um pass antigo não
 * resgata uma falha nova (recência, não otimismo).
 *
 * Append-only: cada run grava uma linha; a leitura ordena por `ran_at DESC`.
 * Manter o histórico permite auditar quando a superfície quebrou, em vez de
 * sobrescrever a evidência anterior.
 */

import type Database from 'better-sqlite3'
import { generateId } from '../utils/id.js'

/** Um veredito de cenário gravado para uma task de superfície. */
export interface ScenarioVerdict {
  nodeId: string
  /** true = a superfície passou; false = falhou. */
  passed: boolean
  /** Qual cenário rodou (quando identificado). */
  scenarioId?: string
  /** Detalhe da falha (assertions, motivo) — auditável. */
  detail?: string
  /** Quando rodou (ms epoch) — a recência decide qual vale. */
  ranAt: number
}

/** Estado que o gate lê. `missing` = nunca rodou; nunca confundir com passed. */
export type SurfaceProofState = 'passed' | 'failed' | 'missing'

interface VerdictRow {
  node_id: string
  scenario_id: string | null
  passed: number
  detail: string | null
  ran_at: number
}

/** Grava um veredito (append-only — o histórico não é sobrescrito). */
export function recordScenarioVerdict(db: Database.Database, verdict: ScenarioVerdict): string {
  const id = generateId('sv')
  db.prepare(
    `INSERT INTO scenario_verdict (id, node_id, scenario_id, passed, detail, ran_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, verdict.nodeId, verdict.scenarioId ?? null, verdict.passed ? 1 : 0, verdict.detail ?? null, verdict.ranAt)
  return id
}

/** O veredito MAIS RECENTE do node, ou null quando nunca rodou. */
export function readLatestScenarioVerdict(db: Database.Database, nodeId: string): ScenarioVerdict | null {
  const row = db
    .prepare(
      `SELECT node_id, scenario_id, passed, detail, ran_at
         FROM scenario_verdict
        WHERE node_id = ?
        ORDER BY ran_at DESC
        LIMIT 1`,
    )
    .get(nodeId) as VerdictRow | undefined

  if (!row) return null

  return {
    nodeId: row.node_id,
    passed: row.passed === 1,
    ...(row.scenario_id !== null ? { scenarioId: row.scenario_id } : {}),
    ...(row.detail !== null ? { detail: row.detail } : {}),
    ranAt: row.ran_at,
  }
}

/**
 * O estado que o gate consome. Ausência de run é `missing` — explicitamente
 * distinta de `failed` e jamais tratada como aprovação.
 */
export function surfaceProofState(db: Database.Database, nodeId: string): SurfaceProofState {
  const verdict = readLatestScenarioVerdict(db, nodeId)
  if (!verdict) return 'missing'
  return verdict.passed ? 'passed' : 'failed'
}
