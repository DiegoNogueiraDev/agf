import { describe, it, expect } from 'vitest'
import { extractDecision, formatDecisionOnly, type Decision } from '../core/output/decision-filter.js'

describe('extractDecision', () => {
  it('extrai APPROVED explícito', () => {
    const d = extractDecision('APPROVED: implementação correta')
    expect(d?.verdict).toBe('approved')
    expect(d?.reason).toContain('implementação')
  })

  it('extrai REJECTED explícito', () => {
    const d = extractDecision('REJECTED: testes falham')
    expect(d?.verdict).toBe('rejected')
  })

  it('extrai bloco JSON de decisão', () => {
    const d = extractDecision('{"decision":"approved","reason":"all checks pass"}')
    expect(d?.verdict).toBe('approved')
    expect(d?.reason).toContain('checks pass')
  })

  it('retorna null para output sem decisão', () => {
    expect(extractDecision('apenas um texto normal')).toBeNull()
  })

  it('extrai APPROVED do meio do texto', () => {
    const d = extractDecision('Análise completa. APPROVED: código atende requisitos. Seguir para deploy.')
    expect(d?.verdict).toBe('approved')
  })
})

describe('formatDecisionOnly', () => {
  it('formata decisão como string compacta', () => {
    const d: Decision = { verdict: 'approved', reason: 'tudo ok', toolName: 'analyze' }
    const out = formatDecisionOnly(d)
    expect(out).toContain('APPROVED')
    expect(out).toContain('tudo ok')
  })

  it('formata REJECTED', () => {
    const d: Decision = { verdict: 'rejected', reason: 'falhou', toolName: 'test' }
    const out = formatDecisionOnly(d)
    expect(out).toContain('REJECTED')
  })
})
