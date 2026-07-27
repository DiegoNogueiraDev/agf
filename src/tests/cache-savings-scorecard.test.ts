import { describe, it, expect } from 'vitest'
import { buildScorecard, formatScorecard, type ScenarioResult } from '../core/evals/scorecard.js'
import { TokenLedger } from '../core/autonomy/token-ledger.js'

function makeResult(overrides: Partial<ScenarioResult> = {}): ScenarioResult {
  return {
    id: 's1',
    tier: 'T0',
    model: 'claude-sonnet',
    resolved: true,
    testsPassed: true,
    done: true,
    tokensIn: 1000,
    tokensOut: 200,
    tokensTotal: 1200,
    cachedTokensIn: 0,
    costUsd: 0.001,
    attempts: 2,
    durationMs: 500,
    stopped: 'done',
    qualityScore: 0.9,
    ...overrides,
  }
}

describe('Scorecard — prompt cache savings', () => {
  it('totalCachedTokensIn is 0 when no results have cached tokens', () => {
    const sc = buildScorecard([makeResult(), makeResult({ id: 's2' })])
    expect(sc.totalCachedTokensIn).toBe(0)
  })

  it('totalCachedTokensIn sums cachedTokensIn across results', () => {
    const sc = buildScorecard([makeResult({ cachedTokensIn: 400 }), makeResult({ id: 's2', cachedTokensIn: 600 })])
    expect(sc.totalCachedTokensIn).toBe(1000)
  })

  it('cacheHitRate = totalCachedTokensIn / sum(tokensIn)', () => {
    const sc = buildScorecard([
      makeResult({ tokensIn: 1000, cachedTokensIn: 200 }),
      makeResult({ id: 's2', tokensIn: 1000, cachedTokensIn: 800 }),
    ])
    // (200 + 800) / (1000 + 1000) = 0.5
    expect(sc.cacheHitRate).toBeCloseTo(0.5, 5)
  })

  it('cacheHitRate is 0 when no tokens in', () => {
    const sc = buildScorecard([makeResult({ tokensIn: 0, cachedTokensIn: 0 })])
    expect(sc.cacheHitRate).toBe(0)
  })

  it('estimatedCacheSavingsUsd is positive when cachedTokensIn > 0', () => {
    const sc = buildScorecard([makeResult({ tokensIn: 1000, cachedTokensIn: 500 })])
    expect(sc.estimatedCacheSavingsUsd).toBeGreaterThan(0)
  })

  it('estimatedCacheSavingsUsd = 0 when cachedTokensIn = 0', () => {
    const sc = buildScorecard([makeResult({ cachedTokensIn: 0 })])
    expect(sc.estimatedCacheSavingsUsd).toBe(0)
  })

  it('formatScorecard includes cache savings line when cachedTokensIn > 0', () => {
    const sc = buildScorecard([makeResult({ cachedTokensIn: 500 })])
    const lines = formatScorecard(sc)
    const hasCacheLine = lines.some((l) => l.toLowerCase().includes('cache'))
    expect(hasCacheLine).toBe(true)
  })

  it('formatScorecard omits cache savings line when cachedTokensIn = 0', () => {
    const sc = buildScorecard([makeResult({ cachedTokensIn: 0 })])
    const lines = formatScorecard(sc)
    const hasCacheLine = lines.some((l) => l.toLowerCase().includes('cache'))
    expect(hasCacheLine).toBe(false)
  })
})

describe('TokenLedger — totals includes cachedTokensIn', () => {
  it('totals().cachedTokensIn is 0 by default', () => {
    const ledger = new TokenLedger()
    ledger.recordCall('n1', { model: 'test', prompt: 'hello', response: 'world' })
    expect(ledger.totals().cachedTokensIn).toBe(0)
  })

  it('totals().cachedTokensIn sums reportedCachedIn across calls', () => {
    const ledger = new TokenLedger()
    ledger.recordCall('n1', {
      model: 'test',
      prompt: 'p',
      response: 'r',
      reportedIn: 100,
      reportedOut: 50,
      reportedCachedIn: 60,
    })
    ledger.recordCall('n1', {
      model: 'test',
      prompt: 'p2',
      response: 'r2',
      reportedIn: 200,
      reportedOut: 80,
      reportedCachedIn: 140,
    })
    expect(ledger.totals().cachedTokensIn).toBe(200)
  })

  it('totals().cachedTokensIn excludes from-cache entries (fromCache=true = local cache hit, no tokens charged)', () => {
    const ledger = new TokenLedger()
    ledger.recordCall('n1', { model: 'test', prompt: 'p', response: 'r', fromCache: true })
    expect(ledger.totals().cachedTokensIn).toBe(0)
  })
})
