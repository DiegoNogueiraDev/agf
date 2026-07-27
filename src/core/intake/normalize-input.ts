/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Pipeline deterministico de entrada — o coracao da economia (Frente A no extremo).
 * Transforma QUALQUER entrada (texto colado, arquivo pdf/html/docx/md, imagem via
 * OCR) num texto destilado ANTES de qualquer chamada de IA: parse -> limpeza ->
 * resumo extrativo 0-token (dedup near-dup por editDistance + ranking por
 * frequencia de termos + bonus de requisito/estrutura). Menos ambiguidade, menos
 * tokens. IA so na borda criativa, com o conteudo ja destilado.
 *
 * Puro por injecao (readFile/ocr/visionFallback) — testavel 0-token.
 */
import { readFileContent } from '../parser/file-reader.js'
import { editDistance } from '../algorithms/dynamic-programming.js'
import { estimateTokens } from '../autonomy/token-ledger.js'
import { ValidationError } from '../utils/errors.js'
import { defaultOcr, type OcrStrategy } from './ocr.js'
import { tryWasmOcr } from './ocr-wasm.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'intake/normalize-input.ts' })

/** Minimo de chars p/ aceitar o OCR como suficiente (senao cai no fallback). */
const MIN_OCR_CHARS = 12

export type IntakeSource =
  { kind: 'text'; value: string } | { kind: 'file'; path: string } | { kind: 'image'; path: string }

export interface NormalizeDeps {
  /** Le um arquivo -> texto. Default: readFileContent (pdf/html/docx/md/txt). */
  readFile?: (path: string) => Promise<string>
  /** OCR de imagem -> texto, ou null se indisponivel. Default: defaultOcr (sistema). */
  ocr?: OcrStrategy
  /** Fallback de visao (gated) quando o OCR falha. Opcional. */
  visionFallback?: (imagePath: string) => Promise<string>
}

export interface NormalizeOptions {
  /** Orcamento de tokens do texto destilado (default ~1500). */
  budgetTokens?: number
  /** Similaridade p/ near-dup [0..1] (default 0.9). */
  dedupThreshold?: number
}

export interface NormalizeResult {
  text: string
  kind: IntakeSource['kind']
  /** De onde veio o texto bruto. */
  source: 'text' | 'file' | 'ocr' | 'vision'
  tokensBefore: number
  tokensAfter: number
  tokensSaved: number
}

const DEFAULT_BUDGET_TOKENS = 1500

/** Controles (exceto \t e \n) — RegExp via string p/ nao colocar bytes crus no fonte. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp('[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f]', 'g')

/** Limpeza deterministica: EOL, controles, linhas em branco, espacos. */
export function cleanText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(CONTROL_CHARS, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Similaridade 0..1 entre duas strings via distancia de edicao normalizada. */
function similarity(a: string, b: string): number {
  if (a === b) return 1
  const max = Math.max(a.length, b.length)
  if (max === 0) return 1
  return 1 - editDistance(a, b).distance / max
}

const REQUIREMENT_RX = /\b(deve|dever[áa]|precisa|requer|must|should|shall|requisito|crit[ée]rio)\b/i

/** Score deterministico de saliencia de uma linha (0-token). */
function lineScore(line: string, termFreq: Map<string, number>): number {
  const trimmed = line.trim()
  if (!trimmed) return -1
  let score = 0
  if (/^#{1,6}\s/.test(trimmed)) score += 5 // heading
  if (/^[-*+]\s|^\d+[.)]\s/.test(trimmed)) score += 2 // bullet/numbered
  if (REQUIREMENT_RX.test(trimmed)) score += 4 // requisito explicito
  // saliencia por frequencia de termos (TF deterministico)
  for (const w of trimmed
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 3)) {
    score += Math.min(termFreq.get(w) ?? 0, 5) * 0.1
  }
  // penaliza linhas muito longas (densidade)
  score -= Math.max(0, trimmed.length - 200) * 0.002
  return score
}

/**
 * Resumo EXTRATIVO deterministico (0 token): dedup near-dup + ranking + corte por
 * orcamento, PRESERVANDO a ordem original. Entrada dentro do orcamento passa intacta.
 */
export function distillText(text: string, opts: NormalizeOptions = {}): string {
  const budget = opts.budgetTokens ?? DEFAULT_BUDGET_TOKENS
  const threshold = opts.dedupThreshold ?? 0.9
  if (estimateTokens(text) <= budget) return text

  const lines = text.split('\n')

  // 1) dedup near-dup (mantem a 1a ocorrencia).
  const kept: string[] = []
  for (const line of lines) {
    const t = line.trim()
    if (!t) {
      if (kept.length && kept[kept.length - 1] !== '') kept.push('')
      continue
    }
    const dup = kept.some((k) => k.trim() && similarity(k.trim(), t) >= threshold)
    if (!dup) kept.push(line)
  }

  // 2) frequencia de termos sobre o conteudo dedup.
  const termFreq = new Map<string, number>()
  for (const line of kept) {
    for (const w of line
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 3)) {
      termFreq.set(w, (termFreq.get(w) ?? 0) + 1)
    }
  }

  // 3) ranqueia indices por score; seleciona ate o orcamento; reordena por posicao.
  const scored = kept.map((line, idx) => ({ idx, line, score: lineScore(line, termFreq) }))
  const ranked = [...scored].sort((a, b) => b.score - a.score)
  const chosen = new Set<number>()
  let tokens = 0
  for (const item of ranked) {
    if (item.score < 0) continue
    const t = estimateTokens(item.line)
    if (tokens + t > budget && chosen.size > 0) continue
    chosen.add(item.idx)
    tokens += t
    if (tokens >= budget) break
  }
  const result = scored
    .filter((s) => chosen.has(s.idx))
    .sort((a, b) => a.idx - b.idx)
    .map((s) => s.line)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return result || text.slice(0, budget * 4) // nunca vazio
}

/** Resolve o texto bruto a partir da fonte (parse/OCR/visao). */
async function resolveRaw(
  source: IntakeSource,
  deps: NormalizeDeps,
): Promise<{ raw: string; from: NormalizeResult['source'] }> {
  if (source.kind === 'text') return { raw: source.value, from: 'text' }
  if (source.kind === 'file') {
    const readFile = deps.readFile ?? (async (p: string) => (await readFileContent(p)).text)
    return { raw: await readFile(source.path), from: 'file' }
  }
  // imagem: OCR-first (0 token); visao so como fallback gated. Ordem de resolucao:
  // injetado (testes) -> WASM zero-config (tesseract.js, se instalado) -> binario
  // do sistema. `??` curto-circuita: com deps.ocr, nada de WASM (testes 0-token).
  const ocr = deps.ocr ?? (await tryWasmOcr()) ?? defaultOcr
  const text = await ocr(source.path)
  if (text && text.trim().length >= MIN_OCR_CHARS) return { raw: text, from: 'ocr' }
  if (deps.visionFallback) {
    log.info('intake:ocr-insufficient-vision-fallback', { path: source.path })
    return { raw: await deps.visionFallback(source.path), from: 'vision' }
  }
  throw new ValidationError(
    'Nao foi possivel ler a imagem sem IA: OCR indisponivel e nenhum provider com visao ativo.',
    [
      'Instale um OCR local: `npm i tesseract.js` (zero-config) ou `brew install tesseract` — leitura deterministica (custo $0), ou',
      'configure um provider com visao (`agf provider use openrouter` + um modelo de visao).',
    ],
  )
}

/**
 * Normaliza a entrada num texto destilado pronto p/ a IA: parse -> limpeza ->
 * resumo extrativo. Retorna o texto + economia de tokens (p/ o lever ledger).
 */
export async function normalizeInput(
  source: IntakeSource,
  deps: NormalizeDeps = {},
  opts: NormalizeOptions = {},
): Promise<NormalizeResult> {
  const { raw, from } = await resolveRaw(source, deps)
  const cleaned = cleanText(raw)
  const tokensBefore = estimateTokens(cleaned)
  const text = distillText(cleaned, opts)
  const tokensAfter = estimateTokens(text)
  return {
    text,
    kind: source.kind,
    source: from,
    tokensBefore,
    tokensAfter,
    tokensSaved: Math.max(0, tokensBefore - tokensAfter),
  }
}
