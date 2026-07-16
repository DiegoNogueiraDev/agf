/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Cascade Verifier — o juiz determinístico da cascata FrugalGPT (A.T1,
 * node_9c91ee7f6240; contract node_653ff13c49fe).
 *
 * A cascata (draft barato → verificar → escalar só se reprovar) só reduz custo
 * se a verificação custar ZERO tokens: este módulo NUNCA chama LLM. Três
 * dimensões puras: (1) schema-parse — reusa {@link parseExecutorResult} do
 * fluxo de brief (hard gate: JSON esperado que não parseia reprova sempre);
 * (2) cobertura de keywords dos AC da task; (3) limites de formato. O score
 * agregado alimenta o laço no tier-router (A.T2); o threshold segue o padrão
 * do eval-rubric (quality gate configurável).
 */

import { parseExecutorResult } from '../context/executor-brief.js'

export interface CascadeVerdict {
  pass: boolean
  /** Score agregado ∈ [0,1] das dimensões aplicáveis. */
  score: number
  /** Vazio quando pass; senão nomeia cada dimensão reprovada. */
  reasons: string[]
}

export interface VerifySignal {
  /** Linhas de AC da task — a cobertura das keywords mede aderência à spec. */
  acLines?: readonly string[]
  /** Exigir que a resposta contenha um ExecutorResult JSON parseável (hard gate). */
  expectJson?: boolean
  /** Limites de formato. */
  minChars?: number
  maxChars?: number
  /** Score mínimo para aceitar o draft. Default 0.6. */
  threshold?: number
}

const DEFAULT_THRESHOLD = 0.6
const DEFAULT_MIN_CHARS = 8
const DEFAULT_MAX_CHARS = 200_000
const MIN_KEYWORD_LENGTH = 4

const STOPWORDS = new Set(['given', 'when', 'then', 'que', 'com', 'sem', 'para', 'the', 'and', 'retorna', 'deve'])

/** Keywords únicas dos AC: palavras ≥4 chars, minúsculas, sem stopwords. */
function acKeywords(acLines: readonly string[]): string[] {
  const words = acLines
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9á-úà-ùâ-ûã-õç]+/i)
    .filter((w) => w.length >= MIN_KEYWORD_LENGTH && !STOPWORDS.has(w))
  return [...new Set(words)]
}

/**
 * Julga um draft. Determinístico e puro: mesma resposta + mesmo sinal →
 * mesmo veredito. Falha de schema é hard gate (pass=false independente do
 * score) — um retorno não-parseável é inutilizável pelo condutor mesmo que
 * "pareça" bom.
 */
export function verifyCascadeResponse(response: string, signal: VerifySignal = {}): CascadeVerdict {
  const threshold = signal.threshold ?? DEFAULT_THRESHOLD
  const reasons: string[] = []
  const dimensions: number[] = []

  // ── Limites de formato ──
  const minChars = signal.minChars ?? DEFAULT_MIN_CHARS
  const maxChars = signal.maxChars ?? DEFAULT_MAX_CHARS
  const withinLimits = response.length >= minChars && response.length <= maxChars
  dimensions.push(withinLimits ? 1 : 0)
  if (!withinLimits) reasons.push(`limits: resposta com ${response.length} chars fora de [${minChars}, ${maxChars}]`)

  // ── Schema (hard gate quando exigido) ──
  let schemaOk = true
  if (signal.expectJson) {
    const jsonStart = response.indexOf('{')
    const candidate = jsonStart >= 0 ? extractJsonBlock(response, jsonStart) : ''
    schemaOk = parseExecutorResult(candidate) !== null
    dimensions.push(schemaOk ? 1 : 0)
    if (!schemaOk) reasons.push('schema-parse: resposta sem ExecutorResult JSON parseável')
  }

  // ── Cobertura de keywords dos AC ──
  if (signal.acLines && signal.acLines.length > 0) {
    const keywords = acKeywords(signal.acLines)
    if (keywords.length > 0) {
      const lower = response.toLowerCase()
      const matched = keywords.filter((k) => lower.includes(k)).length
      const coverage = matched / keywords.length
      dimensions.push(coverage)
      if (coverage < 0.5) reasons.push(`ac-coverage: ${matched}/${keywords.length} keywords dos AC presentes`)
    }
  }

  const score = dimensions.length > 0 ? dimensions.reduce((a, b) => a + b, 0) / dimensions.length : 0
  const pass = schemaOk && withinLimits && score >= threshold
  return { pass, score, reasons: pass ? [] : reasons }
}

/** Extrai o bloco JSON balanceado a partir de `start` (primeiro `{`). */
function extractJsonBlock(text: string, start: number): string {
  let depth = 0
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1
    else if (text[i] === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return text.slice(start)
}
