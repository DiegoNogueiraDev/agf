/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_18dacd94465c — Classificação de erros do provider de LLM.
 *
 * Função pura que mapeia um erro qualquer (status HTTP, headers, mensagem) em
 * {kind, retryable, retryAfterMs?}. Inspirado na classificação do opencode
 * (`packages/llm/src/schema/errors.ts`): o ponto é NÃO re-tentar erros
 * permanentes (auth, content-policy, request inválido) — que só queimam tokens —
 * e respeitar `retry-after` em rate-limit. Determinística, sem rede.
 */

export type LlmErrorKind =
  | 'auth' // 401/403 — credencial inválida/expirada
  | 'content_policy' // filtro de conteúdo — permanente
  | 'invalid_request' // 400/404/422 — payload inválido
  | 'rate_limit' // 429 — retryable, com retryAfterMs
  | 'server' // 5xx — retryable com backoff
  | 'network' // falha de socket/timeout — retryable
  | 'unknown' // não classificado — conservador (não re-tenta)

export interface LlmErrorClassification {
  kind: LlmErrorKind
  retryable: boolean
  /** Espera sugerida antes de re-tentar (ms). Presente em rate_limit. */
  retryAfterMs?: number
}

/** Default de espera quando o rate-limit não traz `retry-after`. */
const DEFAULT_RATE_LIMIT_MS = 1000

type ErrLike = {
  status?: unknown
  statusCode?: unknown
  code?: unknown
  message?: unknown
  retryAfterMs?: unknown
  headers?: unknown
  response?: { status?: unknown; headers?: unknown }
}

/** Lê um header por nome em um objeto plano OU numa instância estilo `Headers`. */
function readHeader(headers: unknown, name: string): string | null {
  if (!headers || typeof headers !== 'object') return null
  const getter = (headers as { get?: unknown }).get
  if (typeof getter === 'function') {
    const v = (getter as (k: string) => unknown).call(headers, name)
    return typeof v === 'string' ? v : null
  }
  const lower = name.toLowerCase()
  for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
    if (k.toLowerCase() === lower && typeof v === 'string') return v
  }
  return null
}

/** Extrai o status HTTP de várias formas comuns; tenta a mensagem por último. */
function extractStatus(err: ErrLike): number | undefined {
  const candidates = [err.status, err.statusCode, err.response?.status]
  for (const c of candidates) {
    const n = typeof c === 'number' ? c : typeof c === 'string' ? Number(c) : NaN
    if (Number.isFinite(n) && n >= 100 && n < 600) return n
  }
  // Fallback: status embutido na mensagem (ex.: "API do Copilot retornou 503: ...").
  if (typeof err.message === 'string') {
    const m = err.message.match(/\b(4\d\d|5\d\d)\b/)
    if (m) return Number(m[1])
  }
  return undefined
}

/** Converte um valor de `retry-after` (segundos ou ms explícito) em ms. */
function resolveRetryAfterMs(err: ErrLike): number {
  if (typeof err.retryAfterMs === 'number' && err.retryAfterMs >= 0) return err.retryAfterMs
  const headers = err.headers ?? err.response?.headers
  const raw = readHeader(headers, 'retry-after')
  if (raw !== null) {
    const seconds = Number(raw)
    if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000)
  }
  return DEFAULT_RATE_LIMIT_MS
}

const CONTENT_POLICY_RE = /content[_\s-]?filter|content[_\s-]?policy|policy violation|moderat/i
const NETWORK_CODE = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'EPIPE', 'ENOTFOUND'])
const NETWORK_MSG_RE = /fetch failed|network|socket hang up|timed? out|timeout|aborted|abort/i
const RETRYABLE_5XX = new Set([500, 502, 503, 504, 529])

/**
 * Classifica um erro do provider de LLM. Pura e determinística.
 * Erros permanentes → `retryable: false` (escala em vez de queimar tokens).
 */
export function classifyLlmError(err: unknown): LlmErrorClassification {
  const e: ErrLike = err && typeof err === 'object' ? (err as ErrLike) : {}
  const message = typeof e.message === 'string' ? e.message : ''
  const status = extractStatus(e)

  if (status === 429) {
    return { kind: 'rate_limit', retryable: true, retryAfterMs: resolveRetryAfterMs(e) }
  }
  if (status === 401 || status === 403) {
    return { kind: 'auth', retryable: false }
  }
  if (status !== undefined && status >= 400 && status < 500 && CONTENT_POLICY_RE.test(message)) {
    return { kind: 'content_policy', retryable: false }
  }
  if (status !== undefined && status >= 400 && status < 500) {
    return { kind: 'invalid_request', retryable: false }
  }
  if (status !== undefined && RETRYABLE_5XX.has(status)) {
    return { kind: 'server', retryable: true }
  }

  // Sem status conclusivo: cheque sinais de rede (code ou mensagem).
  const code = typeof e.code === 'string' ? e.code : ''
  if (NETWORK_CODE.has(code) || (status === undefined && NETWORK_MSG_RE.test(message))) {
    return { kind: 'network', retryable: true }
  }

  return { kind: 'unknown', retryable: false }
}
