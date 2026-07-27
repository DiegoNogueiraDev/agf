/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * A/B POR LEVER — evidência para cada lever, não só para o carro-chefe
 * (node_4c77b1d25c92, épico node_66df2059d21e).
 *
 * PORQUÊ: o A/B que existia media UM lever (`runCascadeAb`, src/core/evals/
 * tier-trade.ts). Um smart-default que só liga o que tem evidência ficaria,
 * portanto, restrito a 1 de N levers — a armadilha measure→activate: medir o
 * flagship e deixar os outros no escuro para sempre. Este harness roda CADA
 * lever pedido ON vs OFF sobre o MESMO task-set e emite um veredito por lever.
 *
 * Disprove conta como resultado: um lever cujo A/B volta NEGATIVO recebe
 * `recommendation:'keep-off'` — a evidência contra a feature é tão válida
 * quanto a favor, e o default-OFF é a rede de segurança.
 *
 * Nunca um zero silencioso: sem provider ⇒ `mode:'delegated'` com motivo;
 * task-set ou lista de levers vazios ⇒ erro acionável (jamais "0 economizado",
 * que se confunde com "nada a economizar").
 *
 * Grava nos MESMOS ledgers que o resto da economia lê (`recordModelCall` +
 * `recordLeverEvent`), então o número aparece em `agf metrics` sem tubulação
 * paralela. Relação com `runCascadeAb`: aquele é o caso específico do lever
 * 'cascade' e permanece a via já shipada; consolidar os dois num só motor é um
 * follow-up de refactor, fora do escopo desta medição.
 */

import type Database from 'better-sqlite3'
import { recordModelCall } from '../observability/llm-call-ledger.js'
import { recordLeverEvent } from './economy-lever-ledger.js'
import { recordLeverVerdict } from './lever-verdict-store.js'
import type { LeverKey } from './economy-levers-config.js'

/** Braço do experimento: lever ligado ou desligado. */
export type LeverArm = 'on' | 'off'

/** Uso real devolvido por uma execução de braço. */
export interface LeverArmUsage {
  inputTokens: number
  outputTokens: number
  costUsd: number
  provider: string
  model: string
  modelTier?: string
}

/** Porta de execução (DIP) — o harness não conhece provider algum. */
export interface LeverAbExecutor {
  /** false ⇒ o harness devolve `delegated` em vez de fabricar número. */
  available(): boolean
  runArm(lever: LeverKey, arm: LeverArm, task: string): Promise<LeverArmUsage>
}

/** Veredito de um lever após o A/B. */
export interface LeverVerdict {
  lever: LeverKey
  /** Σ tokens do braço OFF (baseline). */
  tokensBefore: number
  /** Σ tokens do braço ON. */
  tokensAfter: number
  /** before − after. Negativo = o lever CUSTOU mais (sinal preservado). */
  savedTokens: number
  /** Custo (USD) somado dos dois braços — o preço de obter esta evidência. */
  costUsd: number
  /** Tasks do experimento. */
  taskCount: number
  /** 'enable' quando poupou; 'keep-off' quando não (disprove é resultado). */
  recommendation: 'enable' | 'keep-off'
}

export interface LeverAbLive {
  mode: 'live'
  verdicts: LeverVerdict[]
}

export interface LeverAbDelegated {
  mode: 'delegated'
  reason: string
}

export type LeverAbOutcome = LeverAbLive | LeverAbDelegated

const ARMS: readonly LeverArm[] = ['on', 'off']

function round6(n: number): number {
  return +n.toFixed(6)
}

/**
 * Roda o A/B de cada lever sobre o task-set e devolve um veredito por lever,
 * gravando a evidência nos ledgers reais.
 */
export async function runLeverAb(
  db: Database.Database,
  executor: LeverAbExecutor,
  levers: readonly LeverKey[],
  taskSet: readonly string[],
  opts: { sessionId: string; nodeIdPrefix?: string },
): Promise<LeverAbOutcome> {
  if (levers.length === 0) {
    throw new Error('lever A/B: lista de levers vazia — informe ≥1 lever (nunca resolve com 0 silencioso)')
  }
  if (taskSet.length === 0) {
    throw new Error('lever A/B: task-set vazio — informe ≥1 task (nunca resolve com 0 silencioso)')
  }
  if (!executor.available()) {
    return {
      mode: 'delegated',
      reason: 'nenhum provider conectado: rode com um provider ativo para obter custo real por lever',
    }
  }

  const prefix = opts.nodeIdPrefix ?? 'lever_ab_'
  const verdicts: LeverVerdict[] = []

  for (const lever of levers) {
    verdicts.push(await runOneLever(db, executor, lever, taskSet, opts.sessionId, prefix))
  }

  return { mode: 'live', verdicts }
}

/** O A/B de UM lever sobre o task-set — uma linha de ledger por task. */
async function runOneLever(
  db: Database.Database,
  executor: LeverAbExecutor,
  lever: LeverKey,
  taskSet: readonly string[],
  sessionId: string,
  prefix: string,
): Promise<LeverVerdict> {
  let tokensBefore = 0
  let tokensAfter = 0
  let costUsd = 0

  for (let i = 0; i < taskSet.length; i++) {
    const task = taskSet[i]
    const nodeId = `${prefix}${lever}_${i}`
    const perArm: Record<LeverArm, number> = { on: 0, off: 0 }

    for (const arm of ARMS) {
      const usage = await executor.runArm(lever, arm, task)
      recordModelCall(db, {
        sessionId,
        nodeId,
        // O braço vai no caller: sem isso, custo POR BRAÇO fica irrecuperável
        // (foi exatamente o buraco encontrado no A/B do cascade).
        caller: `lever-ab:${lever}:${arm}`,
        provider: usage.provider,
        model: usage.model,
        ...(usage.modelTier ? { modelTier: usage.modelTier } : {}),
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: usage.costUsd,
      })
      perArm[arm] = usage.inputTokens + usage.outputTokens
      costUsd += usage.costUsd
    }

    const saved = perArm.off - perArm.on
    tokensBefore += perArm.off
    tokensAfter += perArm.on

    recordLeverEvent(db, {
      surface: 'internal',
      sessionId,
      nodeId,
      lever,
      tokensBefore: perArm.off,
      tokensAfter: perArm.on,
      saved,
      accepted: saved > 0,
      gateOutcome: saved > 0 ? 'accepted' : 'passthrough',
    })
  }

  const savedTokens = tokensBefore - tokensAfter
  const verdict: LeverVerdict = {
    lever,
    tokensBefore,
    tokensAfter,
    savedTokens,
    costUsd: round6(costUsd),
    taskCount: taskSet.length,
    // Disprove é resultado: sem economia comprovada, o lever fica OFF.
    recommendation: savedTokens > 0 ? 'enable' : 'keep-off',
  }
  // PERSISTIR é o que transforma a medição em decisão. Sem esta linha o
  // julgamento morre com o processo e o smart-default (lever-evidence-gate.ts)
  // nunca encontra evidência — o gate ficaria correto e eternamente inerte.
  recordLeverVerdict(db, verdict)
  return verdict
}
