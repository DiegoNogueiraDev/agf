import { describe, it, expect } from 'vitest'
import { estimateTokens, TokenLedger } from '../core/autonomy/token-ledger.js'

describe('estimateTokens — heurística chars/4 (zero deps)', () => {
  it('texto vazio = 0 tokens', () => {
    expect(estimateTokens('')).toBe(0)
  })
  it('4 chars = 1 token', () => {
    expect(estimateTokens('abcd')).toBe(1)
  })
  it('arredonda para cima (ceil)', () => {
    expect(estimateTokens('abcde')).toBe(2) // 5/4 → 2
  })
})

describe('TokenLedger — agregação por task', () => {
  it('byTask soma múltiplas chamadas do mesmo node', () => {
    const ledger = new TokenLedger()
    ledger.record('node_1', { model: 'sonnet', tokensIn: 100, tokensOut: 40 })
    ledger.record('node_1', { model: 'sonnet', tokensIn: 30, tokensOut: 10 })

    const t = ledger.byTask('node_1')
    expect(t.calls).toBe(2)
    expect(t.tokensIn).toBe(130)
    expect(t.tokensOut).toBe(50)
    expect(t.total).toBe(180)
  })

  it('byTask de node sem chamadas retorna zeros', () => {
    const ledger = new TokenLedger()
    const t = ledger.byTask('vazio')
    expect(t).toEqual({ nodeId: 'vazio', calls: 0, tokensIn: 0, tokensOut: 0, total: 0 })
  })

  it('totals soma entre tasks; tasks() lista uma linha por node', () => {
    const ledger = new TokenLedger()
    ledger.record('a', { model: 'haiku', tokensIn: 10, tokensOut: 5 })
    ledger.record('b', { model: 'sonnet', tokensIn: 20, tokensOut: 8 })
    ledger.record('a', { model: 'haiku', tokensIn: 4, tokensOut: 2 })

    expect(ledger.totals()).toEqual({ calls: 3, tokensIn: 34, tokensOut: 15, total: 49, cachedTokensIn: 0 })
    expect(ledger.tasks()).toHaveLength(2)
  })

  it('recordCall usa tokens reportados quando há, senão estima por chars/4', () => {
    const ledger = new TokenLedger()
    // reportados
    const reported = ledger.recordCall('n1', {
      model: 'm',
      prompt: 'xxxx',
      response: 'yyyy',
      reportedIn: 99,
      reportedOut: 7,
    })
    expect(reported).toEqual({ model: 'm', tokensIn: 99, tokensOut: 7 })

    // estimados (sem reported): prompt 8 chars → 2, response 4 chars → 1
    const est = ledger.recordCall('n2', { model: 'm', prompt: '12345678', response: 'abcd' })
    expect(est.tokensIn).toBe(2)
    expect(est.tokensOut).toBe(1)
  })

  it('recordCall com fromCache → 0 spend e savedTokens = in+out (economia, não gasto)', () => {
    const ledger = new TokenLedger()
    const hit = ledger.recordCall('n1', {
      model: 'm',
      prompt: 'p',
      response: 'r',
      reportedIn: 60,
      reportedOut: 40,
      fromCache: true,
    })
    expect(hit.tokensIn).toBe(0)
    expect(hit.tokensOut).toBe(0)
    expect(hit.fromCache).toBe(true)
    expect(hit.savedTokens).toBe(100)
    // não conta como spend nos totais
    expect(ledger.totals().total).toBe(0)
  })

  it('entries() expõe uma linha por chamada (para persistência), em ordem', () => {
    const ledger = new TokenLedger()
    ledger.record('a', { model: 'haiku', tokensIn: 10, tokensOut: 5 })
    ledger.record('b', { model: 'sonnet', tokensIn: 20, tokensOut: 8 })

    const entries = ledger.entries()
    expect(entries).toHaveLength(2)
    expect(entries[0]).toEqual({ nodeId: 'a', model: 'haiku', tokensIn: 10, tokensOut: 5 })
    expect(entries[1].nodeId).toBe('b')
  })
})
