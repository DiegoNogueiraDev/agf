/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Fonte estruturada de KR por épico (node_cc9c63611c2e). O épico declara seu Key
 * Result como `metadata.kr = { target, current, unit }` (campo aberto já existente
 * no GraphNode — zero migração). `readEpicKr` devolve o CONTRACT `KrRecord` com
 * `attainment = current/target`. KR só em prosa (sem estrutura) ⇒ status='no-data',
 * provenance='unset' — o cockpit distingue "sem dado" de "0% de atingimento".
 */
import { describe, it, expect } from 'vitest'
import type { GraphNode } from '../core/graph/graph-types.js'
import { readEpicKr, type KrRecord } from '../core/evals/okr-kr-source.js'

const NOW = '2026-07-17T00:00:00.000Z'

function epic(metadata?: GraphNode['metadata']): GraphNode {
  return {
    id: 'e1',
    type: 'epic',
    title: 'epic',
    status: 'backlog',
    priority: 2,
    createdAt: NOW,
    updatedAt: NOW,
    metadata,
  }
}

describe('okr-kr-source — fonte estruturada de KR por épico (node_cc9c63611c2e)', () => {
  // ─── AC1: KR estruturado ⇒ KrRecord com attainment = current/target ─────────
  it('AC1: épico com KR estruturado (target+current) devolve attainment=current/target', () => {
    const rec: KrRecord = readEpicKr(epic({ kr: { target: 100, current: 40, unit: 'percent' } }))
    expect(rec.status).toBe('ok')
    expect(rec.provenance).toBe('metadata')
    expect(rec.target).toBe(100)
    expect(rec.current).toBe(40)
    expect(rec.unit).toBe('percent')
    expect(rec.attainment).toBeCloseTo(0.4, 6)
  })

  it('AC1: coerção de strings numéricas (target="120", current="30") ⇒ attainment=0.25', () => {
    const rec = readEpicKr(epic({ kr: { target: '120', current: '30', unit: 'builds' } }))
    expect(rec.status).toBe('ok')
    expect(rec.attainment).toBeCloseTo(0.25, 6)
  })

  // ─── AC2: prosa (sem estrutura) ⇒ no-data / unset ───────────────────────────
  it('AC2: épico sem metadata.kr (KR só em prosa) ⇒ status=no-data, provenance=unset', () => {
    const rec = readEpicKr(epic(undefined))
    expect(rec.status).toBe('no-data')
    expect(rec.provenance).toBe('unset')
    expect(rec.attainment).toBeNull()
  })

  it('AC2: metadata presente mas sem chave kr ⇒ no-data/unset', () => {
    const rec = readEpicKr(epic({ origin: 'cli' }))
    expect(rec.status).toBe('no-data')
    expect(rec.provenance).toBe('unset')
  })

  // ─── Edges: estrutura parcial/inválida não conta como atingimento ───────────
  it('KR parcial (só target, sem current) ⇒ no-data (não inventa atingimento)', () => {
    const rec = readEpicKr(epic({ kr: { target: 100 } }))
    expect(rec.status).toBe('no-data')
    expect(rec.attainment).toBeNull()
  })

  it('target=0 ⇒ attainment=null (evita divisão por zero), mas os valores são preservados', () => {
    const rec = readEpicKr(epic({ kr: { target: 0, current: 5 } }))
    expect(rec.attainment).toBeNull()
    expect(rec.target).toBe(0)
    expect(rec.current).toBe(5)
  })

  it('valores não-numéricos (target="abc") ⇒ no-data/unset', () => {
    const rec = readEpicKr(epic({ kr: { target: 'abc', current: 'xyz' } }))
    expect(rec.status).toBe('no-data')
    expect(rec.provenance).toBe('unset')
  })
})
