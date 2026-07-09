/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { chooseEffort, effortToWire, type ReasoningEffort } from '../core/model-hub/effort-router.js'

describe('chooseEffort — roteador determinístico de esforço (Frente C / UnCert-CoT)', () => {
  it('tarefas baratas (classify/status) usam esforço mínimo', () => {
    expect(chooseEffort({ kind: 'classify', attempt: 1 })).toBe('minimal')
    expect(chooseEffort({ kind: 'status', attempt: 1 })).toBe('minimal')
  })

  it('reuso (scaffold/exact) na 1ª tentativa → mínimo (template em mãos)', () => {
    expect(chooseEffort({ kind: 'implement', attempt: 1, hasReuse: true })).toBe('minimal')
  })

  it('implement sem reuso na 1ª tentativa → baixo (default enxuto)', () => {
    expect(chooseEffort({ kind: 'implement', attempt: 1 })).toBe('low')
  })

  it('planejar/sintetizar → alto (raciocínio genuíno)', () => {
    expect(chooseEffort({ kind: 'plan', attempt: 1 })).toBe('high')
  })

  it('escala com a incerteza: retry após vermelho eleva o esforço', () => {
    // O teste vermelho É o sinal de incerteza (UnCert-CoT). Mais tentativas → mais esforço.
    const a1 = chooseEffort({ kind: 'implement', attempt: 1 })
    const a2 = chooseEffort({ kind: 'implement', attempt: 2 })
    const a3 = chooseEffort({ kind: 'implement', attempt: 3 })
    const rank: Record<ReasoningEffort, number> = { minimal: 0, low: 1, medium: 2, high: 3 }
    expect(rank[a2]).toBeGreaterThan(rank[a1])
    expect(rank[a3]).toBeGreaterThanOrEqual(rank[a2])
    expect(a3).toBe('high')
  })

  it('retry escala mesmo quando havia reuso (o reuso falhou → incerteza real)', () => {
    expect(chooseEffort({ kind: 'implement', attempt: 2, hasReuse: true })).not.toBe('minimal')
  })

  it('é determinístico (mesma entrada → mesma saída)', () => {
    const sig = { kind: 'implement' as const, attempt: 2 }
    expect(chooseEffort(sig)).toBe(chooseEffort(sig))
  })

  it('é puro — não chama nada caro (sem efeitos): retorna um enum válido sempre', () => {
    const valid: ReasoningEffort[] = ['minimal', 'low', 'medium', 'high']
    for (const kind of ['classify', 'status', 'implement', 'review', 'plan'] as const) {
      for (let attempt = 1; attempt <= 5; attempt++) {
        expect(valid).toContain(chooseEffort({ kind, attempt }))
      }
    }
  })
})

describe('effortToWire — mapeia para o enum aceito pela API (OpenRouter: low|medium|high)', () => {
  it('minimal colapsa em low (OpenRouter não tem "minimal")', () => {
    expect(effortToWire('minimal')).toBe('low')
  })

  it('demais passam direto', () => {
    expect(effortToWire('low')).toBe('low')
    expect(effortToWire('medium')).toBe('medium')
    expect(effortToWire('high')).toBe('high')
  })
})
