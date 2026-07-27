/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes da chave semântica do response-cache (B.T1 — node_54ac47d44de7;
 * contract node_d6746dfc9c6e). Lookup exato SEMPRE primeiro; fallback por
 * cosseno de vetor de termos (puro TS, zero deps) com threshold 0.85 e
 * proveniência em todo hit semântico.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { buildTermVector, cosineSimilarity, hashKey } from '../core/llm/response-cache.js'
import { SqliteCachePersistence } from '../core/llm/response-cache-sqlite.js'

const PROMPT = 'resuma o ledger de economia da task atual com totais por lever e sessao'
const PARAPHRASE = 'resuma o ledger de economia por lever e por sessao da task atual com os totais'
const UNRELATED = 'gere um poema sobre montanhas ao amanhecer com rimas alternadas'

function makePersistence(): SqliteCachePersistence<string> {
  return new SqliteCachePersistence<string>(new Database(':memory:'))
}

function writeCached(p: SqliteCachePersistence<string>, prompt: string, value: string): string {
  const key = hashKey(prompt)
  p.write({ key, value, schemaVersion: 1, createdAtMs: Date.now(), expiresAtMs: Date.now() + 60_000 })
  p.attachSemantic(key, prompt, {})
  return key
}

describe('cosineSimilarity + buildTermVector (puro TS, zero deps)', () => {
  it('AC3: o mesmo par duas vezes produz similaridade identica (determinismo)', () => {
    const a = cosineSimilarity(buildTermVector(PROMPT), buildTermVector(PARAPHRASE))
    const b = cosineSimilarity(buildTermVector(PROMPT), buildTermVector(PARAPHRASE))
    expect(a).toBe(b)
    expect(a).toBeGreaterThan(0.85)
  })

  it('prompts sem relacao ficam bem abaixo do threshold', () => {
    expect(cosineSimilarity(buildTermVector(PROMPT), buildTermVector(UNRELATED))).toBeLessThan(0.3)
  })
})

describe('lookup semantico com fallback do exato', () => {
  it('AC1: prompt parafraseado com similaridade >=0.85 => hit semantico com proveniencia', () => {
    // Arrange
    const p = makePersistence()
    const sourceKey = writeCached(p, PROMPT, 'resposta-cacheada')

    // Act
    const hit = p.readSemantic(PARAPHRASE, { threshold: 0.85 })

    // Assert
    expect(hit).toBeDefined()
    expect(hit!.entry.value).toBe('resposta-cacheada')
    expect(hit!.kind).toBe('semantic')
    expect(hit!.similarity).toBeGreaterThanOrEqual(0.85)
    expect(hit!.sourceKey).toBe(sourceKey)
  })

  it('AC2: similaridade abaixo do threshold => miss (nenhuma resposta servida)', () => {
    const p = makePersistence()
    writeCached(p, PROMPT, 'resposta-cacheada')
    expect(p.readSemantic(UNRELATED, { threshold: 0.85 })).toBeUndefined()
  })

  it('AC4: lookup exato disponivel responde primeiro (zero comparacoes semanticas)', () => {
    // Arrange
    const p = makePersistence()
    writeCached(p, PROMPT, 'resposta-cacheada')

    // Act — mesma chave exata
    const hit = p.lookupWithSemanticFallback(hashKey(PROMPT), PROMPT, { threshold: 0.85 })

    // Assert — caminho exato, sem custo semantico
    expect(hit!.kind).toBe('exact')
    expect(hit!.semanticComparisons).toBe(0)
    expect(hit!.entry.value).toBe('resposta-cacheada')
  })

  it('miss exato cai no semantico e reporta as comparacoes feitas', () => {
    const p = makePersistence()
    writeCached(p, PROMPT, 'resposta-cacheada')
    const hit = p.lookupWithSemanticFallback(hashKey(PARAPHRASE), PARAPHRASE, { threshold: 0.85 })
    expect(hit!.kind).toBe('semantic')
    expect(hit!.semanticComparisons).toBeGreaterThanOrEqual(1)
  })

  it('entrada expirada nunca e servida pelo caminho semantico', () => {
    const p = makePersistence()
    const key = hashKey(PROMPT)
    p.write({ key, value: 'velha', schemaVersion: 1, createdAtMs: 1, expiresAtMs: 2 })
    p.attachSemantic(key, PROMPT, {})
    expect(p.readSemantic(PARAPHRASE, { threshold: 0.85 })).toBeUndefined()
  })
})

describe('escopo + invalidacao (B.T2 node_a843100c3836)', () => {
  it('AC1: pergunta semanticamente identica de OUTRO node_id => miss (escopo impede cross-task)', () => {
    // Arrange
    const p = makePersistence()
    const key = hashKey(PROMPT)
    p.write({ key, value: 'da-task-n1', schemaVersion: 1, createdAtMs: Date.now(), expiresAtMs: Date.now() + 60_000 })
    p.attachSemantic(key, PROMPT, { nodeId: 'n1', command: 'brief' })

    // Act + Assert — escopo de outra task nunca serve
    expect(p.readSemantic(PARAPHRASE, { threshold: 0.85, scope: { nodeId: 'n2' } })).toBeUndefined()
    // mesmo escopo => hit
    expect(p.readSemantic(PARAPHRASE, { threshold: 0.85, scope: { nodeId: 'n1' } })).toBeDefined()
  })

  it('AC2: TTL expirado => miss E a entrada e removida do banco', () => {
    // Arrange
    const p = makePersistence()
    const key = hashKey(PROMPT)
    p.write({ key, value: 'velha', schemaVersion: 1, createdAtMs: 1, expiresAtMs: 2 })
    p.attachSemantic(key, PROMPT, {})
    expect(p.size()).toBe(1)

    // Act
    const hit = p.readSemantic(PARAPHRASE, { threshold: 0.85 })

    // Assert — miss + limpeza fisica
    expect(hit).toBeUndefined()
    expect(p.size()).toBe(0)
  })

  it('AC3: node atualizado apos a gravacao => miss (invalidacao por updatedAt)', () => {
    // Arrange — entrada criada em t; node mudou depois (nodeUpdatedAtMs maior)
    const p = makePersistence()
    const key = hashKey(PROMPT)
    const createdAt = Date.now() - 10_000
    p.write({ key, value: 'stale', schemaVersion: 1, createdAtMs: createdAt, expiresAtMs: Date.now() + 60_000 })
    p.attachSemantic(key, PROMPT, { nodeId: 'n1' })

    // Act + Assert — node mudou apos a gravacao => nao servir
    expect(
      p.readSemantic(PARAPHRASE, { threshold: 0.85, scope: { nodeId: 'n1' }, nodeUpdatedAtMs: createdAt + 5_000 }),
    ).toBeUndefined()
    // node NAO mudou desde a gravacao => hit normal
    expect(
      p.readSemantic(PARAPHRASE, { threshold: 0.85, scope: { nodeId: 'n1' }, nodeUpdatedAtMs: createdAt - 5_000 }),
    ).toBeDefined()
  })
})
