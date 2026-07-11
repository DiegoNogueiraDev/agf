/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Truncação com marcador (M1l) — corta texto grande (ex.: saída de teste) ao
 * orçamento de chars, preservando CABEÇA e CAUDA com um marcador central que
 * informa quantos chars foram omitidos. A cauda importa: é onde costuma estar a
 * mensagem de erro. (Marcador adaptado do opencode, MIT.)
 */

/** Fração do orçamento reservada à cabeça; o resto vai para a cauda (erro). */
const HEAD_FRACTION = 0.4

/**
 * Trunca `text` para no máximo ~`maxChars` chars visíveis, inserindo
 * `…[omitido N chars]…` entre cabeça e cauda. Texto dentro do limite passa
 * intacto.
 */
export function truncateWithMarker(text: string, maxChars: number): string {
  if (maxChars > 0 && text.length <= maxChars) return text

  const budget = Math.max(0, Math.floor(maxChars))
  const headLen = Math.floor(budget * HEAD_FRACTION)
  const tailLen = budget - headLen
  const omitted = text.length - budget

  const head = text.slice(0, headLen)
  const tail = tailLen > 0 ? text.slice(text.length - tailLen) : ''
  return `${head}\n…[omitido ${omitted} chars]…\n${tail}`
}
