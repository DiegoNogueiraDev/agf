/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Task-Aware Prune — poda de tool-output condicionada à task ATIVA (E2.T2,
 * node_ea0b184ab57d; contract node_6ee6fb0849cf; Squeez, arXiv 2604.04979).
 *
 * Estágio da família do content-router: pontua cada linha com BM25
 * ({@link rankChunksByBm25} — reuso, zero scorer novo) contra as keywords do
 * {@link TaskSignal} e poda as de score zero até o floor de retenção. Toda poda
 * passa pela lossy-gate ({@link applyLossyTransform} com verify de preservação
 * de erros) — reprovou, devolve o texto ORIGINAL (auto-revert).
 *
 * Contratos de não-regressão (risk node_37aeb5672ac2): signal null ou
 * degenerado (<3 keywords) ⇒ byte-idêntico, outcome `passthrough`.
 */

import type Database from 'better-sqlite3'
import { rankChunksByBm25 } from '../context/bm25-compressor.js'
import { estimateTokens } from '../context/token-estimator.js'
import type { TaskSignal } from '../context/task-signal.js'
import { applyLossyTransform, createErrorPreserveVerify, type GateOutcome } from './lossy-gate.js'
import { recordLeverEvent } from './economy-lever-ledger.js'

export interface TaskAwarePruneResult {
  text: string
  droppedLines: number
  /** Linhas que casam keyword do AC mantidas / originais (contract: ∈ [0,1]). */
  retention: number
  outcome: GateOutcome
}

const MIN_SIGNAL_KEYWORDS = 3
const DEFAULT_RETENTION_FLOOR = 0.5

/** Resultado byte-idêntico (sinal ausente/degenerado ou nada a podar). */
function passthrough(text: string): TaskAwarePruneResult {
  return { text, droppedLines: 0, retention: 1, outcome: 'passthrough' }
}

/**
 * Poda linhas irrelevantes à task ativa. Determinística fora do gate; o gate
 * decide aceitar/reverter comparando original × candidato.
 */
export async function pruneTaskAware(
  text: string,
  signal: TaskSignal | null,
  opts: { retentionFloor?: number } = {},
): Promise<TaskAwarePruneResult> {
  if (!signal || signal.keywords.length < MIN_SIGNAL_KEYWORDS) return passthrough(text)

  const lines = text.split('\n')
  if (lines.length < 2) return passthrough(text)

  const query = signal.keywords.join(' ')
  const scoreByContent = new Map<string, number>()
  for (const chunk of rankChunksByBm25(lines, query)) {
    scoreByContent.set(chunk.content, chunk.score)
  }

  const floor = opts.retentionFloor ?? DEFAULT_RETENTION_FLOOR
  const minKept = Math.ceil(lines.length * floor)
  const zeroScoreCount = lines.filter((l) => (scoreByContent.get(l) ?? 0) <= 0).length
  const maxDroppable = Math.max(0, lines.length - minKept)
  const dropBudget = Math.min(zeroScoreCount, maxDroppable)
  if (dropBudget === 0) return passthrough(text)

  // Poda em ordem original: score zero cai até esgotar o budget (floor intocável).
  let dropped = 0
  const kept: string[] = []
  for (const line of lines) {
    const isZero = (scoreByContent.get(line) ?? 0) <= 0
    if (isZero && dropped < dropBudget) {
      dropped += 1
      continue
    }
    kept.push(line)
  }
  const pruned = kept.join('\n')

  const gate = await applyLossyTransform<string>({
    original: text,
    transform: () => pruned,
    kind: 'nl',
    verify: createErrorPreserveVerify(),
  })

  if (gate.outcome === 'reverted') {
    return { text, droppedLines: 0, retention: 1, outcome: 'reverted' }
  }

  const matches = (l: string): boolean => (scoreByContent.get(l) ?? 0) > 0
  const originalMatching = lines.filter(matches).length
  const keptMatching = kept.filter(matches).length
  const retention = originalMatching > 0 ? keptMatching / originalMatching : 1

  return { text: gate.value, droppedLines: dropped, retention, outcome: gate.outcome }
}

// ── Estágio do compress run (E2.T3, node_ea13f329f163) ──

export interface CompressPayloadLike {
  compressed: string
  tokens: { before: number; after: number; saved: number; ratio: number }
}

export interface TaskAwareStageInfo {
  droppedLines: number
  retention: number
  outcome: GateOutcome
}

/**
 * Aplica a poda task-aware SOBRE o payload já comprimido do compress run e
 * grava a economia adicional como linha própria (`task_aware_prune`,
 * surface=hook) — atribuição separada do `exec_compress` base. Sinal null ⇒
 * payload intocado (byte-idêntico, zero linhas de ledger).
 */
export async function applyTaskAwareToPayload<P extends CompressPayloadLike>(
  payload: P,
  signal: TaskSignal | null,
  ledger: { db: Database.Database | null; sessionId?: string } = { db: null },
): Promise<P & { taskAware?: TaskAwareStageInfo }> {
  if (!signal) return payload

  const result = await pruneTaskAware(payload.compressed, signal)
  const info: TaskAwareStageInfo = {
    droppedLines: result.droppedLines,
    retention: result.retention,
    outcome: result.outcome,
  }
  if (result.outcome === 'passthrough') return { ...payload, taskAware: info }

  const afterTokens = estimateTokens(result.text)
  const extraSaved = Math.max(0, payload.tokens.after - afterTokens)
  if (ledger.db && (extraSaved > 0 || result.outcome === 'reverted')) {
    try {
      recordLeverEvent(ledger.db, {
        sessionId: ledger.sessionId ?? 'compress-run',
        nodeId: signal.taskId,
        lever: 'task_aware_prune',
        tokensBefore: payload.tokens.after,
        tokensAfter: afterTokens,
        saved: extraSaved,
        accepted: result.outcome !== 'reverted',
        gateOutcome: result.outcome === 'reverted' ? 'reverted' : 'accepted',
        surface: 'hook',
      })
    } catch {
      // ledger nunca quebra o hot-path do hook
    }
  }
  if (result.outcome === 'reverted') return { ...payload, taskAware: info }

  const before = payload.tokens.before
  return {
    ...payload,
    compressed: result.text,
    tokens: {
      before,
      after: afterTokens,
      saved: payload.tokens.saved + extraSaved,
      ratio: before > 0 ? afterTokens / before : 1,
    },
    taskAware: info,
  }
}
