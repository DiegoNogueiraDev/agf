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
export type SurfaceProofState = 'passed' | 'failed' | 'missing' | 'inconclusive'

/** The verdict vocabulary produced by the browser scenario oracle. */
export type OracleVerdict = 'passed' | 'failed' | 'inconclusive'

/** Marker prefix that tags a `detail` string as carrying an oracle verdict. */
const ORACLE_DETAIL_PREFIX = 'oracle:'

/**
 * Encode an oracle verdict into the `detail` column.
 *
 * WHY a tagged detail instead of a new column: the stored row is a boolean
 * `passed`, and rows written before this bridge existed carry free prose in
 * `detail`. A prefix lets the third state round-trip without a migration and
 * without reinterpreting legacy prose as a verdict.
 */
export function oracleDetail(verdict: OracleVerdict, corroboration?: CorroborationLevel): string {
  const base = `${ORACLE_DETAIL_PREFIX}${verdict}`
  return corroboration ? `${base}:${corroboration}` : base
}

/** How strongly a pass was corroborated; `unknown` is a row written before this was recorded. */
export type CorroborationLevel = 'none' | 'identity' | 'effect' | 'both'
const CORROBORATION_LEVELS: readonly CorroborationLevel[] = ['none', 'identity', 'effect', 'both']

/** Read the level back out of a tagged detail; absent ⇒ legacy row. */
function corroborationOf(detail: string | undefined): CorroborationLevel | null {
  if (!detail?.startsWith(ORACLE_DETAIL_PREFIX)) return null
  const level = detail.slice(ORACLE_DETAIL_PREFIX.length).split(':')[1]
  return CORROBORATION_LEVELS.find((l) => l === level) ?? null
}

/**
 * Translate an oracle verdict into the state the gate consumes.
 *
 * The whole point is that `inconclusive` survives the crossing. Collapsing it
 * into `failed` would tell the gate a scenario BROKE when the truth is that it
 * never concluded — the false-negative twin of the false success this oracle
 * exists to prevent. Only an explicit pass may ever open the gate.
 */
export function surfaceProofFromOracle(verdict: OracleVerdict): SurfaceProofState {
  return verdict === 'passed' ? 'passed' : verdict === 'failed' ? 'failed' : 'inconclusive'
}

/** Read an oracle verdict back out of a `detail` string, if it carries one. */
function oracleVerdictOf(detail: string | undefined): OracleVerdict | null {
  if (!detail?.startsWith(ORACLE_DETAIL_PREFIX)) return null
  // The detail is `oracle:<verdict>` or `oracle:<verdict>:<corroboration>`; take
  // only the verdict segment so a level never breaks the reading of the state.
  const raw = detail.slice(ORACLE_DETAIL_PREFIX.length).split(':')[0]
  return raw === 'passed' || raw === 'failed' || raw === 'inconclusive' ? raw : null
}

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
  // A row tagged by the oracle carries the three-valued truth; anything else is a
  // legacy boolean row and keeps its original meaning.
  const fromOracle = oracleVerdictOf(verdict.detail)
  if (fromOracle) return surfaceProofFromOracle(fromOracle)
  return verdict.passed ? 'passed' : 'failed'
}

/**
 * The surface-proof fragment a command merges into its output payload.
 *
 * Returns an EMPTY object for a non-surface task — not a null field, not an "n/a"
 * string. That is what makes the feature additive by construction: a task with no
 * scenario edge produces byte-identical output to before, so no existing consumer
 * (or golden test) can be broken by a verdict that happens to exist in the store
 * for an unrelated node. Opt-in has to be provable, not promised.
 */
export function surfaceProofPayload(
  isSurface: boolean,
  state: SurfaceProofState,
): Record<string, never> | { surface_proof: SurfaceProofState } {
  return isSurface ? { surface_proof: state } : {}
}

/**
 * Whether closing this task must be refused for lack of surface proof.
 *
 * Only a concluded `passed` opens the gate. `missing` (no scenario ever ran) and
 * `inconclusive` (it ran but never concluded) block exactly like `failed`: absence
 * of proof is not proof, and "cannot tell" is not approval. Stated as an explicit
 * allow-list rather than a deny-list so a state added later blocks by default
 * instead of silently becoming a way through.
 *
 * A task that never declared itself a surface is never blocked — the epic's
 * additive constraint.
 */
export function surfaceProofBlocksDone(isSurface: boolean, state: SurfaceProofState): boolean {
  if (!isSurface) return false
  return state !== 'passed'
}

/** KR instrument: how the surface gate is actually behaving across the graph. */
export interface SurfaceGateReport {
  /** Tasks that declared themselves surfaces (the population the gate can act on). */
  surfaceLeaves: number
  /** Surface leaves whose proof is a concluded pass — the gate had evidence and let them through. */
  gated: number
  /** Why the remaining leaves are blocked, kept separate so "never ran" is never read as "broke". */
  blockedStates: { missing: number; failed: number; inconclusive: number }
  /**
   * Surface leaves the gate would block DESPITE a concluded pass. Structurally zero
   * — and computed, never asserted: if someone inverts the gate this rises, which is
   * the only reason a zero here means anything.
   */
  falsePositives: number
  /**
   * Passes that proved nothing beyond "a screenshot exists" — the scenario never
   * declared where it should land or what should change. Counted apart because a
   * KR keyed on `gated` alone cannot see the difference it exists to police.
   */
  hollow: number
  /**
   * Gated leaves by corroboration strength. `unknown` is a row written before the
   * level was recorded: it is NOT folded into a corroborated bucket, since letting
   * an old hollow green inherit the benefit of the doubt is exactly how a stricter
   * bar gets satisfied by something that never met it.
   */
  corroboration: { none: number; identity: number; effect: number; both: number; unknown: number }
}

/**
 * Measure the surface gate over the real verdict rows.
 *
 * ANTI-GOODHART: every number comes from running {@link surfaceProofBlocksDone} on
 * real state rather than from a literal. A report that hardcoded `falsePositives: 0`
 * would look identical with the gate unwired — the exact "instrument proves nothing"
 * failure this epic was built to catch. Feeding it the surface-task ids keeps it a
 * pure read: the caller owns the graph traversal, this owns the verdicts.
 */
export function surfaceGateReport(db: Database.Database, surfaceTaskIds: readonly string[]): SurfaceGateReport {
  const blockedStates = { missing: 0, failed: 0, inconclusive: 0 }
  const corroboration = { none: 0, identity: 0, effect: 0, both: 0, unknown: 0 }
  let gated = 0
  let falsePositives = 0

  for (const nodeId of surfaceTaskIds) {
    const state = surfaceProofState(db, nodeId)
    const blocked = surfaceProofBlocksDone(true, state)
    if (state === 'passed') {
      gated++
      const level = corroborationOf(readLatestScenarioVerdict(db, nodeId)?.detail)
      corroboration[level ?? 'unknown']++
      // Running the real decision is the point: a passing leaf that still blocks
      // means the gate is inverted, and the count says so instead of hiding it.
      if (blocked) falsePositives++
      continue
    }
    if (state === 'missing' || state === 'failed' || state === 'inconclusive') blockedStates[state]++
  }

  return {
    surfaceLeaves: surfaceTaskIds.length,
    gated,
    blockedStates,
    falsePositives,
    hollow: corroboration.none,
    corroboration,
  }
}
