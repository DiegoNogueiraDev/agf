/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * AC testability rigor (M3) with Shannon entropy-inspired scoring.
 *
 * A GIVEN/WHEN/THEN structure gives positive signal, but structure alone is
 * cheap to game ("GIVEN x WHEN y THEN works"). The score measures *information
 * density*: how much does the THEN clause restrict the valid implementation
 * space? Numeric thresholds, HTTP status codes, and boolean states each add
 * measurable entropy to the contract — making it both harder to fake and
 * easier to derive a deterministic test from.
 *
 * Deterministic, zero-token. Reuses {@link parseAc}.
 */

import type { AcFormat } from '../../schemas/ac-quality-schema.js'
import { parseAc } from './ac-parser.js'

/** Thrown when scoreAcTestability receives an invalid (empty/blank) input. */
export class AcValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AcValidationError'
  }
}

/** Modal verbs that signal an untestable, aspirational outcome. */
const MODAL_VERBS_RE = /\b(should|would|could|must|may|might|can|will|shall)\b/i

/** Action verbs that denote an observable outcome (modals deliberately excluded). */
const OUTCOME_VERBS = [
  'returns',
  'retorna',
  'exibe',
  'displays',
  'cria',
  'creates',
  'valida',
  'validates',
  'rejeita',
  'rejects',
  'redireciona',
  'redirects',
  'envia',
  'sends',
  'salva',
  'saves',
  'mostra',
  'shows',
  'permite',
  'allows',
  'bloqueia',
  'blocks',
  'remove',
  'removes',
  'atualiza',
  'updates',
  'calcula',
  'calculates',
  'gera',
  'generates',
  'persiste',
  'persists',
  'throws',
  'lança',
  'emits',
  'emite',
  'logs',
  'registra',
]

// HTTP 2xx/3xx/4xx/5xx status codes
const STATUS_CODE_RE = /\b[2345]\d{2}\b/

// Numeric measurements: "100ms", "< 200ms", "≤ 50", "within 3s", "95%", "3.5 MB"
const NUMERIC_THRESHOLD_RE =
  /\b\d+(\.\d+)?\s*(ms|s\b|sec|min|kb|mb|gb|%|px|rem|em|vw|vh|rpm|rps|tps)\b|[<>≤≥]=?\s*\d+|\bwithin\s+\d+|\bunder\s+\d+|\bless\s+than\s+\d+|\bmais\s+de\s+\d+|\bmenos\s+de\s+\d+|\bmenor\s+que\s+\d+|\bmaior\s+que\s+\d+/i

// Concrete boolean / enumerated state
const BOOLEAN_STATE_RE =
  /\b(true|false|enabled|disabled|empty|null|zero|active|inactive|visible|hidden|locked|unlocked|open|closed|success|failure|erro|ok|vazio|ativo|inativo)\b/i

// Stopwords for cosine similarity tokenization (English + Portuguese)
const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'and',
  'or',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'it',
  'by',
  'as',
  'be',
  'do',
  'has',
  'given',
  'when',
  'then',
  'that',
  'this',
  'not',
  'no',
  'o',
  'a',
  'e',
  'de',
  'do',
  'da',
  'em',
  'no',
  'na',
  'por',
  'para',
  'com',
  'um',
  'uma',
  'os',
  'as',
  'dos',
  'das',
  'seu',
  'sua',
  'dado',
  'quando',
  'entao',
  'então',
])

export type ConcreteLabel = 'strong_concrete' | 'weak_concrete'

export interface AcTestabilityResult {
  ac: string
  format: AcFormat
  /** GWT or checklist structure. */
  hasStructure: boolean
  /** Has a real action/outcome verb (not just a modal). */
  hasObservableOutcome: boolean
  isMeasurable: boolean
  /** Weak = no structure AND no observable outcome → no deterministic test derivable. */
  weak: boolean
  reason?: string
  /** Entropy-based informativeness score (0-100). Higher = more testable. */
  score: number
  /** Breakdown of score contributions for diagnostics. */
  scoreReasons: string[]
  /**
   * strong_concrete: has numeric threshold, HTTP status code, or boolean state → machine-verifiable.
   * weak_concrete: no concrete evidence — outcome is ambiguous and untestable by inspection.
   */
  concreteLabel: ConcreteLabel
  /**
   * Semantic warnings about the AC quality:
   * - 'modal_verb_in_outcome': the THEN clause uses a modal verb (should/would/could…) instead of a concrete action
   * - 'no_outcome_verb': the THEN clause has no observable action verb
   */
  semanticWarnings: string[]
}

export interface RedundancyWarning {
  ac1: string
  ac2: string
  similarity: number
}

export interface BatchAcResult {
  scored: AcTestabilityResult[]
  redundancyWarnings: RedundancyWarning[]
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-záàâãéèêíïóôõöúüçñ0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
}

export function cosineSimilarity(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0
  const freqA: Record<string, number> = {}
  const freqB: Record<string, number> = {}
  for (const w of tokensA) freqA[w] = (freqA[w] ?? 0) + 1
  for (const w of tokensB) freqB[w] = (freqB[w] ?? 0) + 1

  const allWords = new Set([...Object.keys(freqA), ...Object.keys(freqB)])
  let dot = 0
  let magA = 0
  let magB = 0
  for (const w of allWords) {
    const fa = freqA[w] ?? 0
    const fb = freqB[w] ?? 0
    dot += fa * fb
    magA += fa * fa
    magB += fb * fb
  }
  if (magA === 0 || magB === 0) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

function computeScore(
  ac: string,
  parsed: ReturnType<typeof parseAc>,
): {
  score: number
  scoreReasons: string[]
  concreteLabel: ConcreteLabel
  semanticWarnings: string[]
} {
  let score = 0
  const scoreReasons: string[] = []
  const semanticWarnings: string[] = []
  const lower = ac.toLowerCase()

  // Structure bonus
  if (parsed.format === 'gwt') {
    score += 30
    scoreReasons.push('+30 GWT structure')
  } else if (parsed.format === 'checklist') {
    score += 20
    scoreReasons.push('+20 checklist structure')
  }

  // Observable outcome verb (modals excluded)
  const hasOutcomeVerb = OUTCOME_VERBS.some((v) => lower.includes(v))
  if (hasOutcomeVerb) {
    score += 10
    scoreReasons.push('+10 observable outcome verb')
  } else {
    semanticWarnings.push('no_outcome_verb')
  }

  // Semantic penalty: modal verb used instead of a concrete outcome verb
  const hasModalVerb = MODAL_VERBS_RE.test(lower)
  if (hasModalVerb && !hasOutcomeVerb) {
    score -= 10
    scoreReasons.push('-10 modal verb in outcome (no concrete action verb)')
    if (!semanticWarnings.includes('modal_verb_in_outcome')) {
      semanticWarnings.push('modal_verb_in_outcome')
    }
  }

  // HTTP status code (high-information concrete outcome)
  const hasStatusCode = STATUS_CODE_RE.test(ac)
  if (hasStatusCode) {
    score += 20
    scoreReasons.push('+20 HTTP status code')
  }

  // Numeric threshold (quantified constraint)
  const hasNumericThreshold = NUMERIC_THRESHOLD_RE.test(ac)
  if (hasNumericThreshold) {
    score += 25
    scoreReasons.push('+25 numeric threshold')
  }

  // Boolean / enumerated state
  const hasBooleanState = BOOLEAN_STATE_RE.test(lower)
  if (hasBooleanState) {
    score += 15
    scoreReasons.push('+15 boolean/concrete state')
  }

  // Penalty: no concrete evidence → outcome is unverifiable
  const hasConcreteEvidence = hasStatusCode || hasNumericThreshold || hasBooleanState
  if (!hasConcreteEvidence) {
    score -= 15
    scoreReasons.push('-15 no concrete evidence (no numeric, status code, or boolean state)')
  }

  const concreteLabel: ConcreteLabel = hasConcreteEvidence ? 'strong_concrete' : 'weak_concrete'

  return { score: Math.max(0, Math.min(100, score)), scoreReasons, concreteLabel, semanticWarnings }
}

/** Score how testable a single AC text is. Deterministic. Throws {@link AcValidationError} for empty input. */
export function scoreAcTestability(ac: string): AcTestabilityResult {
  if (!ac || !ac.trim()) {
    throw new AcValidationError('AC text must not be empty — a silent score of 0 masks the problem')
  }
  const parsed = parseAc(ac)
  const hasStructure = parsed.format === 'gwt' || parsed.format === 'checklist'
  const lower = ac.toLowerCase()
  const hasObservableOutcome = OUTCOME_VERBS.some((v) => lower.includes(v))
  const weak = !hasStructure && !hasObservableOutcome
  const reason = weak
    ? 'sem estrutura Given/When/Then e sem verbo de resultado observável — não dá pra derivar um teste determinístico'
    : undefined

  const { score, scoreReasons, concreteLabel, semanticWarnings } = computeScore(ac, parsed)

  return {
    ac,
    format: parsed.format,
    hasStructure,
    hasObservableOutcome,
    isMeasurable: parsed.isMeasurable,
    weak,
    reason,
    score,
    scoreReasons,
    concreteLabel,
    semanticWarnings,
  }
}

/**
 * Score a batch of ACs and detect redundant pairs (cosine similarity ≥ threshold).
 * Redundant ACs reduce test suite entropy — different ACs should cover different
 * behavioral constraints, not rephrase the same scenario.
 */
export function scoreAcTestabilityBatch(acs: string[], similarityThreshold = 0.7): BatchAcResult {
  const scored = acs.map((ac) => scoreAcTestability(ac))
  const redundancyWarnings: RedundancyWarning[] = []

  const tokens = acs.map(tokenize)
  for (let i = 0; i < acs.length; i++) {
    for (let j = i + 1; j < acs.length; j++) {
      const similarity = cosineSimilarity(tokens[i], tokens[j])
      if (similarity >= similarityThreshold) {
        redundancyWarnings.push({ ac1: acs[i], ac2: acs[j], similarity })
      }
    }
  }

  return { scored, redundancyWarnings }
}
