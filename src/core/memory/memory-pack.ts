/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Memory Pack — retrieval de memória com teto de tokens (node_2a8c83993c72;
 * playbook mem0: 594→166 tokens no mesmo query com pack organizado).
 *
 * WHY: despejar TODAS as memórias no contexto cresce sem limite com o projeto.
 * O pack seleciona o TOP-N por salience — a salience inicial gravada no write
 * (amortize, node_5c8bbec46123) decaída pela idade via retention.ts (ACT-R:
 * ativação decai exponencialmente) — e corta no prefixo que cabe no budget
 * (default 200 tokens). Determinístico: salience desc, empate → nome asc,
 * prefixo estrito (nunca pula uma entrada grande para encaixar uma menor —
 * top-N de verdade, não knapsack).
 *
 * Gate: lever `memory_salience` default-OFF ⇒ {@link memoryPackFromLevers}
 * devolve null e NENHUM caminho de leitura atual muda. A economia real
 * (Σ tudo − Σ pack) é gravada no economy_lever_ledger quando um ledger é
 * fornecido; falha de ledger nunca quebra o retrieval.
 */

import type Database from 'better-sqlite3'
import { readAllMemories, listMemoryRefs } from './memory-reader.js'
import { computeRetentionScore } from '../economy/retention.js'
import { estimateTokens } from '../context/token-estimator.js'
import { recordLeverEvent } from '../economy/economy-lever-ledger.js'
import { isLeverEnabled, getLeverParam, type EconomyLeversConfig } from '../economy/economy-levers-config.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'memory-pack.ts' })

export const DEFAULT_PACK_BUDGET_TOKENS = 200

const MS_PER_DAY = 86_400_000

export interface MemoryPackEntry {
  name: string
  content: string
  tokens: number
  salience: number
}

export interface MemoryPack {
  entries: MemoryPackEntry[]
  /** Σ tokens das entradas selecionadas (≤ budget). */
  tokens: number
  totalCandidates: number
}

export interface MemoryPackOptions {
  /** Teto de tokens do pack. Default {@link DEFAULT_PACK_BUDGET_TOKENS}. */
  budgetTokens?: number
  /** Relógio injetável (idade p/ o decay). Default Date.now(). */
  nowMs?: number
  /** Quando presente, grava a economia no economy_lever_ledger. */
  ledger?: { db: Database.Database; sessionId?: string; nodeId?: string }
}

/**
 * Monta o pack top-N por salience sob o budget. Puro em relação às memórias
 * (só leitura); null quando não há nenhuma memória.
 */
export async function buildMemoryPack(basePath: string, opts: MemoryPackOptions = {}): Promise<MemoryPack | null> {
  const budget = opts.budgetTokens ?? DEFAULT_PACK_BUDGET_TOKENS
  const nowMs = opts.nowMs ?? Date.now()

  const memories = await readAllMemories(basePath)
  if (memories.length === 0) return null
  const mtimeByName = new Map((await listMemoryRefs(basePath)).map((r) => [r.id, r.updatedAt]))

  const scored = memories
    .map((m) => {
      const ageDays = Math.max(0, (nowMs - (mtimeByName.get(m.name) ?? nowMs)) / MS_PER_DAY)
      return {
        name: m.name,
        content: m.content,
        tokens: estimateTokens(m.content),
        salience: computeRetentionScore(m.salience ?? 1, ageDays),
      }
    })
    .sort((a, b) => b.salience - a.salience || (a.name < b.name ? -1 : 1))

  const entries: MemoryPackEntry[] = []
  let packTokens = 0
  for (const candidate of scored) {
    if (packTokens + candidate.tokens > budget) break // prefixo estrito: top-N, não knapsack
    entries.push(candidate)
    packTokens += candidate.tokens
  }

  const totalTokens = scored.reduce((sum, c) => sum + c.tokens, 0)
  recordPackSavings(opts.ledger, totalTokens, packTokens)

  return { entries, tokens: packTokens, totalCandidates: scored.length }
}

/** Economia real do pack no ledger — nunca quebra o retrieval. */
function recordPackSavings(ledger: MemoryPackOptions['ledger'], tokensBefore: number, tokensAfter: number): void {
  const saved = tokensBefore - tokensAfter
  if (!ledger || saved <= 0) return
  try {
    recordLeverEvent(ledger.db, {
      sessionId: ledger.sessionId ?? 'memory-pack',
      nodeId: ledger.nodeId,
      lever: 'memory_salience',
      tokensBefore,
      tokensAfter,
      saved,
      accepted: true,
      gateOutcome: 'accepted',
      surface: 'context',
    })
  } catch (err) {
    log.warn(`memory_salience ledger write failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Gate da lever: OFF ⇒ null (nenhum caminho de leitura muda); ON ⇒ opções com
 * o budget do param `packBudgetTokens` (default 200).
 */
export function memoryPackFromLevers(cfg: EconomyLeversConfig): MemoryPackOptions | null {
  if (!isLeverEnabled(cfg, 'memory_salience')) return null
  return { budgetTokens: getLeverParam(cfg, 'memory_salience', 'packBudgetTokens', DEFAULT_PACK_BUDGET_TOKENS) }
}
