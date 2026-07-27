/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { recordModelCall } from '../core/observability/llm-call-ledger.js'
import { recordLeverEvent } from '../core/economy/economy-lever-ledger.js'
import { summarizeBaseline, formatBaseline, simulateProviders, formatSimulate } from '../core/observability/baseline.js'
import { insertEpisodicOutcome } from '../core/store/episodic-outcomes-store.js'

function freshStore(): SqliteStore {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  const store = new SqliteStore(db)
  store.initProject('proj-baseline')
  return store
}

describe('summarizeBaseline — decomposição nos 3 termos (§1)', () => {
  it('modelo com preço: 3 termos somam ≈ actual; cache/baseline corretos', () => {
    const store = freshStore()
    recordModelCall(store.getDb(), {
      sessionId: 's1',
      provider: 'openrouter',
      model: 'deepseek/deepseek-chat', // 0,14 in / 0,28 out
      inputTokens: 10000,
      cachedInputTokens: 8000,
      outputTokens: 3000,
      reasoningTokens: 2500,
    })
    recordLeverEvent(store.getDb(), {
      sessionId: 's1',
      lever: 'compress',
      tokensBefore: 0,
      tokensAfter: 0,
      saved: 500,
      accepted: true,
      gateOutcome: 'accepted',
    })

    const r = summarizeBaseline(store.getDb())
    // termos
    expect(r.inputFull.usd).toBeCloseTo((2000 * 0.14) / 1e6, 9) // (10000-8000) cheios
    expect(r.cachePaid.usd).toBeCloseTo((8000 * 0.14 * 0.1) / 1e6, 9)
    expect(r.output.usd).toBeCloseTo((3000 * 0.28) / 1e6, 9)
    // soma dos 3 == actual
    expect(r.inputFull.usd + r.cachePaid.usd + r.output.usd).toBeCloseTo(r.actualUsd, 12)
    // Frente B: cache economizou 90% do input cacheado
    expect(r.cacheSavedUsd).toBeCloseTo((8000 * 0.14 * 0.9) / 1e6, 9)
    // economia determinística (lever) convertida pela rate do modelo dominante
    expect(r.leverSavedTokens).toBe(500)
    expect(r.leverSavedUsd).toBeCloseTo((500 * 0.14) / 1e6, 12)
    // baseline = actual + cacheSaved + leverSaved
    expect(r.baselineTotalUsd).toBeCloseTo(r.actualUsd + r.cacheSavedUsd + r.leverSavedUsd, 12)
    expect(r.fator).toBeGreaterThan(1)
    store.close()
  })

  it('sinais §6 + veredito output-dominante + avisos de cache/overthinking', () => {
    const store = freshStore()
    recordModelCall(store.getDb(), {
      sessionId: 's1',
      provider: 'openrouter',
      model: 'deepseek/deepseek-chat',
      inputTokens: 10000,
      cachedInputTokens: 8000, // 80% < 90% → aviso
      outputTokens: 3000,
      reasoningTokens: 2500, // 83% do output → aviso overthinking
    })
    const r = summarizeBaseline(store.getDb())
    expect(r.cacheHitRatio).toBeCloseTo(0.8, 6)
    expect(r.reasonShare).toBeCloseTo(2500 / 3000, 6)
    // output ponderado (3000·2) domina sobre input (2000 + 800)
    expect(r.outputShare).toBeGreaterThan(0.6)
    expect(r.verdict).toMatch(/Output domina/i)
    expect(r.warnings.join(' ')).toMatch(/90%/) // cache abaixo de 90%
    expect(r.warnings.join(' ')).toMatch(/overthinking|Racioc/i)
    store.close()
  })

  it('input-dominante → veredito "pode valer"', () => {
    const store = freshStore()
    recordModelCall(store.getDb(), {
      sessionId: 's1',
      provider: 'openrouter',
      model: 'deepseek/deepseek-chat',
      inputTokens: 10000,
      cachedInputTokens: 0,
      outputTokens: 500, // output pequeno → input domina
    })
    const r = summarizeBaseline(store.getDb())
    expect(r.inputShare).toBeGreaterThan(0.6)
    expect(r.verdict).toMatch(/Input\/contexto domina/i)
    expect(r.warnings.join(' ')).toMatch(/Sem cache de prefixo/i) // C=0
    store.close()
  })

  it('costPerSuccess: baseline report inclui custo por sucesso + baseline comparativo', () => {
    const store = freshStore()
    // 2 chamadas LLM em nodes diferentes, 1 sucesso
    recordModelCall(store.getDb(), {
      sessionId: 's1',
      nodeId: 'node_a',
      provider: 'openrouter',
      model: 'deepseek/deepseek-chat',
      inputTokens: 10000,
      cachedInputTokens: 5000,
      outputTokens: 2000,
      costUsd: (2000 * 0.14 + 5000 * 0.14 * 0.1 + 2000 * 0.28) / 1e6,
    })
    recordModelCall(store.getDb(), {
      sessionId: 's1',
      nodeId: 'node_b',
      provider: 'openrouter',
      model: 'deepseek/deepseek-chat',
      inputTokens: 5000,
      cachedInputTokens: 0,
      outputTokens: 1000,
      costUsd: (5000 * 0.14 + 1000 * 0.28) / 1e6,
    })
    insertEpisodicOutcome(store.getDb(), {
      id: 'eo_a',
      nodeId: 'node_a',
      outcome: 'success',
      taskType: 'implement',
      tags: '["implement"]',
      approachSummary: 'baseline test',
      cycleTimeDelta: 0,
      reopenCount: 0,
      createdAt: Date.now(),
    })
    recordLeverEvent(store.getDb(), {
      sessionId: 's1',
      lever: 'compress',
      tokensBefore: 0,
      tokensAfter: 0,
      saved: 500,
      accepted: true,
      gateOutcome: 'accepted',
    })

    const r = summarizeBaseline(store.getDb())
    expect(r.succeeded).toBe(1)
    expect(r.costPerSuccess).toBeCloseTo(r.actualUsd / 1, 6)
    expect(r.baselineCostPerSuccess).toBeCloseTo(r.baselineTotalUsd / 1, 6)
    expect(formatBaseline(r).join('\n')).toMatch(/Custo por sucesso/)
    expect(formatBaseline(r).join('\n')).toMatch(/Baseline contrafactual/)
    store.close()
  })

  it('modelo local sem preço: token-first ($0), ainda decompõe e dá veredito', () => {
    const store = freshStore()
    recordModelCall(store.getDb(), {
      sessionId: 's1',
      provider: 'ollama',
      model: 'qwen2.5-coder:7b', // sem preço cadastrado
      inputTokens: 5000,
      cachedInputTokens: 0,
      outputTokens: 1000,
    })
    const r = summarizeBaseline(store.getDb())
    expect(r.priced).toBe(false)
    expect(r.actualUsd).toBe(0)
    expect(r.hasData).toBe(true)
    expect(r.tokensIn).toBe(5000)
    expect(r.tokensOut).toBe(1000)
    // input ponderado (5000) > output ponderado (1000·2=2000)
    expect(r.inputShare).toBeGreaterThan(0.6)
    expect(r.warnings.join(' ')).toMatch(/sem pre[çc]o/i)
    store.close()
  })

  it('sem dados → hasData false e mensagem orientadora', () => {
    const store = freshStore()
    const r = summarizeBaseline(store.getDb())
    expect(r.hasData).toBe(false)
    expect(formatBaseline(r).join('\n')).toMatch(/Sem dados.*--live/i)
    store.close()
  })
})

describe('simulateProviders — pior caso cross-provider (sem conectar)', () => {
  it('re-precifica o mesmo perfil; opus é o pior, gemini-flash o mais barato', () => {
    const r = simulateProviders(10000, 0, 2000)
    // opus 15/75 → 10000·15/1e6 + 2000·75/1e6 = 0.30 (pior)
    expect(r.rows[0].model).toBe('claude-opus-4')
    expect(r.worstUsd).toBeCloseTo(0.3, 6)
    // gemini-2.0-flash 0,075/0,3 → 0.00075 + 0.0006 = 0.00135 (mais barato)
    expect(r.cheapestUsd).toBeCloseTo(0.00135, 6)
    expect(r.spread).toBeGreaterThan(100)
    // sem duplicar a entrada de prefixo 'deepseek/'
    expect(r.rows.filter((x) => x.model.endsWith('/'))).toHaveLength(0)
    expect(formatSimulate(r).join('\n')).toMatch(/Pior caso/i)
  })

  it('aplica desconto de cache no perfil simulado', () => {
    const sem = simulateProviders(10000, 0, 2000).rows.find((x) => x.model === 'deepseek/deepseek-chat')!
    const com = simulateProviders(10000, 8000, 2000).rows.find((x) => x.model === 'deepseek/deepseek-chat')!
    expect(com.usd).toBeLessThan(sem.usd) // cache barateia o input
  })

  it('sem dados → mensagem orientadora', () => {
    expect(formatSimulate(simulateProviders(0, 0, 0)).join('\n')).toMatch(/Sem dados/i)
  })
})
