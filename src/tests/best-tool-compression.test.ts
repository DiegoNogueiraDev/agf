/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * WS-B / T1.4 — content-router cablado na via ativa (implement-attempt).
 * bestToolCompression roteia a saída de ferramenta pelo content-router
 * (json-crush / code-ast / dedup-log) e adota o de maior economia, sempre
 * seguro, e NUNCA aplica o ramo lossy `caveman` na saída de ferramenta.
 */
import { describe, it, expect } from 'vitest'
import { bestToolCompression } from '../core/autonomy/implement-attempt.js'
import { compressToolOutput } from '../core/tool-compress/index.js'

describe('bestToolCompression — content-router na via ativa', () => {
  it('crusha um array JSON homogêneo (ganho > tool-compress base)', () => {
    const arr = Array.from({ length: 200 }, (_, i) => ({ id: i, name: `item-${i}`, ok: true }))
    const raw = JSON.stringify(arr)
    const out = bestToolCompression(raw)
    expect(out.saved).toBeGreaterThan(0)
    expect(out.value.length).toBeLessThan(raw.length)
    // ganho ≥ o que o tool-compress base sozinho conseguiria
    expect(out.saved).toBeGreaterThanOrEqual(compressToolOutput(raw).saved)
    expect(out.filter).toBe('json-summarizer')
  })

  it('nunca seleciona o ramo caveman para saída de ferramenta', () => {
    const prose = 'The quick brown fox really just basically jumps over the very lazy dog. '.repeat(40)
    const out = bestToolCompression(prose)
    expect(out.filter).not.toBe('caveman')
  })

  it('seguro: texto pequeno sem ganho retorna o original', () => {
    const small = 'tiny output'
    const out = bestToolCompression(small)
    expect(out.value).toBe(small)
    expect(out.saved).toBe(0)
  })
})
