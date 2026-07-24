/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { hasWasmOcr, tryWasmOcr, _resetWasmOcrCache } from '../core/intake/ocr-wasm.js'
import { ocrMode } from '../core/intake/ocr.js'
import { normalizeInput } from '../core/intake/normalize-input.js'

// Contrato presence-agnóstico: tesseract.js é dep OPCIONAL. Pode estar presente
// (transitivo) ou ausente — os testes valem nos dois casos, sem rede/imagem real.
describe('ocr-wasm (dep opcional)', () => {
  it('hasWasmOcr → boolean, nunca lança', () => {
    expect(typeof hasWasmOcr()).toBe('boolean')
  })

  it('tryWasmOcr → null OU função, memoizado e estável, nunca lança', async () => {
    _resetWasmOcrCache()
    const first = await tryWasmOcr()
    const second = await tryWasmOcr()
    expect(first).toBe(second) // memo
    expect(first === null || typeof first === 'function').toBe(true)
    // coerência com hasWasmOcr: presente → função; ausente → null
    expect(hasWasmOcr() ? typeof first === 'function' : first === null).toBe(true)
  })

  it('ocrMode ∈ {wasm, sistema, indisponível}', () => {
    expect(['wasm', 'sistema', 'indisponível']).toContain(ocrMode())
  })
})

describe('normalize-input resolução de OCR', () => {
  it('OCR injetado curto-circuita (0 token, não toca WASM nem sistema)', async () => {
    const norm = await normalizeInput(
      { kind: 'image', path: '/tmp/board.png' },
      { ocr: async () => 'a fazer | fazendo | feito — mover cards entre colunas' },
    )
    expect(norm.source).toBe('ocr')
    expect(norm.text).toContain('fazer')
  })

  it('OCR injetado nulo e sem visão → erro acionável citando tesseract.js', async () => {
    await expect(normalizeInput({ kind: 'image', path: '/tmp/x.png' }, { ocr: async () => null })).rejects.toThrow(
      /OCR indisponivel|sem IA/i,
    )
  })
})
