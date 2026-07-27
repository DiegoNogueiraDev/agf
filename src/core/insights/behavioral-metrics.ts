/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 *
 * O harness mede qualidade de CÓDIGO (8 dims). Para aceitar os 7 objetivos da
 * 0.20.0 honestamente, é preciso medir COMPORTAMENTO em runtime:
 *  - Autonomia: fração de tasks concluídas SEM override humano.
 *  - Resiliência: MTTR de task (tempo médio de recuperação falha→re-pass).
 *
 * Função pura (zero IO) → testável e determinística. O wrapper de store vive no
 * comando `agf insights behavioral`.
 */

/** Registro mínimo de task para o cálculo de autonomia. */
export interface BehavioralTaskRecord {
  status: string
  /** true quando a task sofreu override (start_task ≠ sugestão do next). */
  hadOverride?: boolean
}

/** Registro de recuperação: timestamps de falha e re-pass (ms epoch). */
export interface RecoveryRecord {
  failedAt: number
  recoveredAt: number
}

export interface BehavioralMetrics {
  /** done sem override / done (0–1); 0 quando não há tasks done. */
  autonomyRate: number
  autonomousTasks: number
  totalDone: number
  /** Tempo médio de recuperação (ms); 0 quando não há recuperações. */
  resilienceMttrMs: number
  recoveries: number
}

/**
 * Calcula autonomia (done sem override) e resiliência (MTTR de recuperação) a
 * partir de registros simples. Pura e determinística — sem divisão por zero.
 */
export function computeBehavioralMetrics(
  tasks: BehavioralTaskRecord[],
  recoveries: RecoveryRecord[],
): BehavioralMetrics {
  const done = tasks.filter((t) => t.status === 'done')
  const totalDone = done.length
  const autonomousTasks = done.filter((t) => !t.hadOverride).length
  const autonomyRate = totalDone === 0 ? 0 : autonomousTasks / totalDone

  const valid = recoveries.filter((r) => r.recoveredAt >= r.failedAt)
  const resilienceMttrMs =
    valid.length === 0 ? 0 : Math.round(valid.reduce((acc, r) => acc + (r.recoveredAt - r.failedAt), 0) / valid.length)

  return {
    autonomyRate: Math.round(autonomyRate * 1000) / 1000,
    autonomousTasks,
    totalDone,
    resilienceMttrMs,
    recoveries: valid.length,
  }
}

/** Registro de submissão para assertividade: passou os AC na 1ª passada? */
export interface SubmissionRecord {
  acPassed: boolean
}

export interface AssertivenessMetrics {
  /** AC-pass de 1ª passada / total (0–1); 0 quando não há submissões. */
  assertivenessRate: number
  passed: number
  total: number
}

/**
 * Assertividade = taxa de AC-pass de 1ª passada. Pura e determinística — mede o
 * acerto do executor (objetivo 0.20.0). Sem submissões → 0 (sem div por zero).
 */
export function computeAssertiveness(records: SubmissionRecord[]): AssertivenessMetrics {
  const total = records.length
  const passed = records.filter((r) => r.acPassed).length
  const assertivenessRate = total === 0 ? 0 : Math.round((passed / total) * 1000) / 1000
  return { assertivenessRate, passed, total }
}
