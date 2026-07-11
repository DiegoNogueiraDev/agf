/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_eabc05b02657 — Status line compacta da TUI: tokens da sessão, custo USD
 * e modelo ativo. Pura e determinística. Inspirado em opencode
 * `session-context-usage.tsx`.
 */
import { createLogger } from '../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'tui/status-line.ts' })

export interface StatusLineInput {
  /** Total de tokens consumidos na sessão. */
  totalTokens: number
  /** Custo estimado em USD. */
  costUsd: number
  /** Modelo ativo (ou 'auto'). */
  model: string
}

/** Monta a linha de status: "⛁ 1240 tok · $0.0030 · claude-sonnet-4.6". */
export function formatStatusLine(input: StatusLineInput): string {
  log.debug(`formatStatusLine: ${input.totalTokens} tok, $${input.costUsd.toFixed(4)}`)
  const tokens = `${Math.max(0, Math.round(input.totalTokens))} tok`
  const cost = `$${input.costUsd.toFixed(4)}`
  return `⛁ ${tokens} · ${cost} · ${input.model}`
}
