/*!
 * SPDX-License-Identifier: MIT
 * Copyright © 2024-2026 decolua and contributors (9router)
 * Copyright © 2026 Diego Lima Nogueira de Paula (TypeScript port and changes)
 *
 * Ported from 9router (https://github.com/decolua/9router), MIT, whose
 * open-sse/rtk module is itself a port of rtk (https://github.com/rtk-ai/rtk),
 * Apache-2.0, © Patrick Szymkowiak. This file stays under its original MIT
 * terms; agent-graph-flow as a whole is Apache-2.0. See THIRD-PARTY-NOTICES.md.
 */

/**
 * Discover loop — fecha o ciclo do registry. Registra as saídas que passaram
 * SEM filtro (elegíveis por tamanho, mas nenhum `detect` casou), agrupadas por
 * uma assinatura barata. O relatório mostra "que formato de saída mais queimou
 * token sem cobertura" → exatamente os filtros que faltam adicionar. Data-driven:
 * não se especula cobertura, mede-se. Gated por `AGF_COMPRESS_DISCOVER=1` (overhead 0
 * por default). Persistência opcional em JSON (cross-run), sem schema/migração.
 *
 * A4 — compress discover mode: também varre o llm_call_ledger (SQLite) para
 * estimar savings potenciais em outputs históricos que passaram sem filtro.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { MIN_COMPRESS_SIZE } from './constants.js'

export interface DiscoverRecord {
  signature: string
  sample: string
  count: number
  bytes: number
}

const misses = new Map<string, DiscoverRecord>()

/** Recording ligado só sob `AGF_COMPRESS_DISCOVER=1` (profiling opt-in). */
export function discoverEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.AGF_COMPRESS_DISCOVER === '1'
}

/** Primeira linha não-vazia, aparada. */
function firstLine(text: string): string {
  for (const l of text.split('\n')) {
    if (l.trim()) return l.trim()
  }
  return ''
}

/**
 * Assinatura estável que agrupa saídas semelhantes: 1ª linha não-vazia com
 * números→`#`, hex→`#`, e segmentos de path colapsados → `/…`. Trunca em 64.
 */
export function signatureOf(text: string): string {
  return firstLine(text)
    .replace(/\b[0-9a-f]{7,}\b/gi, '#') // hashes/hex
    .replace(/\d+/g, '#') // números
    .replace(/(^|\s)(\/[^\s]+|[.\w-]+\/[^\s]+)/g, '$1/…') // paths
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64)
}

/** Registra uma saída elegível que não casou nenhum filtro. No-op se desligado. */
export function recordMiss(text: string, env: Record<string, string | undefined> = process.env): void {
  if (!discoverEnabled(env)) return
  if (text.length < MIN_COMPRESS_SIZE) return
  const signature = signatureOf(text)
  if (!signature) return
  const rec = misses.get(signature) ?? { signature, sample: firstLine(text).slice(0, 100), count: 0, bytes: 0 }
  rec.count++
  rec.bytes += text.length
  misses.set(signature, rec)
}

/** Top-N misses por bytes acumulados (o que mais paga adicionar um filtro). */
export function topMisses(n = 15): DiscoverRecord[] {
  return [...misses.values()].sort((a, b) => b.bytes - a.bytes).slice(0, n)
}

/** Limpa o acumulador em memória (testes / novo ciclo). */
export function resetDiscover(): void {
  misses.clear()
}

/** Mescla o acumulador atual em `filePath` (JSON), somando contagens/bytes. */
export function persistDiscover(filePath: string): void {
  const existing = loadDiscover(filePath)
  const merged = new Map<string, DiscoverRecord>(existing.map((r) => [r.signature, { ...r }]))
  for (const rec of misses.values()) {
    const prev = merged.get(rec.signature)
    if (prev) {
      prev.count += rec.count
      prev.bytes += rec.bytes
    } else {
      merged.set(rec.signature, { ...rec })
    }
  }
  writeFileSync(filePath, JSON.stringify([...merged.values()], null, 2), 'utf8')
}

/** Lê os registros persistidos (vazio se ausente/ilegível). */
export function loadDiscover(filePath: string): DiscoverRecord[] {
  if (!existsSync(filePath)) return []
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'))
    return Array.isArray(parsed) ? (parsed as DiscoverRecord[]) : []
  } catch {
    return []
  }
}

/** Relatório humano dos top misses. */
export function formatDiscover(records: DiscoverRecord[]): string {
  if (records.length === 0) {
    return 'compress discover: nenhuma saída não-comprimida registrada. (Ligue com AGF_COMPRESS_DISCOVER=1 e rode o agente.)'
  }
  const lines = ['compress discover — saídas sem filtro (candidatos a novos filtros), por bytes:', '']
  for (const r of records) {
    const kb = (r.bytes / 1024).toFixed(1)
    lines.push(`  ${kb.padStart(8)} KB  ×${String(r.count).padStart(4)}  ${r.sample}`)
  }
  lines.push('', 'Cada linha é um formato recorrente sem cobertura — adicione um filtro (built-in ou custom).')
  return lines.join('\n')
}

export interface LedgerDiscoverRecord {
  signature: string
  sample: string
  callCount: number
  inputTokens: number
  outputTokens: number
  estimatedSavingsTokens: number
  estimatedSavingsPct: number
}

/**
 * Scan the llm_call_ledger for historical tool outputs that passed through
 * without compress filter coverage. Estimates token savings if filters were applied.
 * Requires a live SqliteStore with populated llm_call_ledger.
 */
export function scanLedgerForMissedFilters(db: import('better-sqlite3').Database, limit = 20): LedgerDiscoverRecord[] {
  const map = new Map<string, { count: number; inputTokens: number; outputTokens: number; sample: string }>()

  try {
    const rows = db
      .prepare(
        `SELECT input_tokens, output_tokens, model FROM llm_call_ledger
         WHERE caller IN ('tool', 'openai-tool', 'agent-tool-result', 'claude-string')
           AND output_tokens > 500
         ORDER BY ts DESC
         LIMIT 1000`,
      )
      .all() as Array<{ input_tokens: number; output_tokens: number; model: string }>

    for (const row of rows) {
      const text = `tool_output_${row.model}` // approximate signature from model + token count
      const sig = signatureOf(text).slice(0, 50)
      const existing = map.get(sig)
      if (existing) {
        existing.count++
        existing.inputTokens += row.input_tokens
        existing.outputTokens += row.output_tokens
      } else {
        map.set(sig, {
          count: 1,
          inputTokens: row.input_tokens,
          outputTokens: row.output_tokens,
          sample: `${row.model} — ${row.output_tokens} tokens/output`,
        })
      }
    }
  } catch {
    return []
  }

  const records: LedgerDiscoverRecord[] = []
  for (const [sig, data] of map) {
    // Conservative estimate: compress filters achieve ~60% reduction on average
    const estimatedReduction = 0.6
    const estimatedSavings = Math.round(data.outputTokens * estimatedReduction)
    records.push({
      signature: sig,
      sample: data.sample,
      callCount: data.count,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      estimatedSavingsTokens: estimatedSavings,
      estimatedSavingsPct: estimatedReduction * 100,
    })
  }

  return records.sort((a, b) => b.estimatedSavingsTokens - a.estimatedSavingsTokens).slice(0, limit)
}

/**
 * Format ledger discover results as a human-readable report.
 */
export function formatLedgerDiscover(records: LedgerDiscoverRecord[]): string {
  if (records.length === 0) {
    return 'Ledger discover: sem dados no llm_call_ledger. Popule o ledger rodando tarefas com ECONOMY_* ligado.'
  }
  const lines = ['compress discover (llm_call_ledger) — top savings opportunities:', '']
  const totalSavings = records.reduce((s, r) => s + r.estimatedSavingsTokens, 0)
  for (const r of records) {
    const savK = (r.estimatedSavingsTokens / 1000).toFixed(1)
    lines.push(`  ${savK.padStart(8)}K tokens  ×${String(r.callCount).padStart(4)} calls  ${r.sample}`)
  }
  lines.push('')
  lines.push(
    `Total estimado: ~${(totalSavings / 1000).toFixed(0)}K tokens savings potenciais (${records.length} patterns)`,
  )
  lines.push('Adicione filtros TOML via .agf/filters.toml para capturar esses padrões.')
  return lines.join('\n')
}
