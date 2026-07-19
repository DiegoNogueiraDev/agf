/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * Tests for computeOkrStatus (node_b1918a5a4643, épico node_fa33f02975c3).
 * O status on-track|at-risk NÃO pode ser inventado: deriva do attainment REAL
 * (KrRecord) + ritmo real. Regra do CONTRACT node_62b00f3381b8
 * (evidence-by-provenance): KR sem fonte OU histórico insuficiente ⇒ 'no-data',
 * NUNCA 'on-track' — um verde falso é pior que um "não sei".
 */

import { describe, it, expect } from 'vitest'
import { computeOkrStatus } from '../core/okr/okr-status.js'
import type { KrRecord } from '../core/evals/okr-kr-source.js'

const T0 = Date.parse('2026-01-01T00:00:00Z')
const DEADLINE = '2026-02-01T00:00:00Z'
/** Metade do caminho até a deadline. */
const HALFWAY = Date.parse('2026-01-16T00:00:00Z')

function kr(over: Partial<KrRecord> = {}): KrRecord {
  return {
    target: 100,
    current: 50,
    unit: 'percent',
    attainment: 0.5,
    status: 'ok',
    provenance: 'metadata',
    ...over,
  }
}

const base = {
  deadline: DEADLINE,
  startedAt: '2026-01-01T00:00:00Z',
  now: HALFWAY,
  deliveredTasks: 8,
}

describe('computeOkrStatus — no-data guards (never a false green)', () => {
  it('KR sem fonte (provenance unset) → no-data, nunca on-track', () => {
    const v = computeOkrStatus({ ...base, kr: kr({ status: 'no-data', provenance: 'unset', attainment: null }) })
    expect(v.status).toBe('no-data')
    expect(v.provenance).toBe('unset')
  })

  it('attainment null mesmo com status ok → no-data', () => {
    const v = computeOkrStatus({ ...base, kr: kr({ attainment: null }) })
    expect(v.status).toBe('no-data')
  })

  it('histórico insuficiente (nenhuma task entregue) → no-data', () => {
    const v = computeOkrStatus({ ...base, kr: kr(), deliveredTasks: 0 })
    expect(v.status).toBe('no-data')
    expect(v.reason).toMatch(/hist/i)
  })

  it('sem deadline e sem projeção → no-data (não dá para julgar ritmo sem horizonte)', () => {
    const v = computeOkrStatus({ ...base, kr: kr(), deadline: null })
    expect(v.status).toBe('no-data')
  })
})

describe('computeOkrStatus — on-track vs at-risk', () => {
  it('attainment adiante do tempo decorrido → on-track', () => {
    // metade do prazo decorrido, 80% atingido ⇒ ritmo suficiente
    const v = computeOkrStatus({ ...base, kr: kr({ current: 80, attainment: 0.8 }) })
    expect(v.status).toBe('on-track')
  })

  it('ritmo insuficiente para a deadline → at-risk', () => {
    // metade do prazo decorrido, só 10% atingido ⇒ não chega
    const v = computeOkrStatus({ ...base, kr: kr({ current: 10, attainment: 0.1 }) })
    expect(v.status).toBe('at-risk')
  })

  it('KR já atingido (attainment >= 1) → on-track', () => {
    const v = computeOkrStatus({ ...base, kr: kr({ current: 100, attainment: 1 }) })
    expect(v.status).toBe('on-track')
  })

  it('projeção do forecast vence a régua linear: projeta atingir → on-track', () => {
    const v = computeOkrStatus({ ...base, kr: kr({ attainment: 0.1 }), projectedAttainment: 1.05 })
    expect(v.status).toBe('on-track')
  })

  it('projeção do forecast abaixo de 1 → at-risk mesmo com attainment alto', () => {
    const v = computeOkrStatus({ ...base, kr: kr({ attainment: 0.9 }), projectedAttainment: 0.4 })
    expect(v.status).toBe('at-risk')
  })

  it('deadline já passada sem atingir → at-risk (nunca on-track)', () => {
    const v = computeOkrStatus({ ...base, kr: kr({ attainment: 0.5 }), now: Date.parse('2026-03-01T00:00:00Z') })
    expect(v.status).toBe('at-risk')
  })
})

describe('computeOkrStatus — provenance é sempre carregada (auditável)', () => {
  it('status derivado carrega a provenance do KR, não uma string inventada', () => {
    const v = computeOkrStatus({ ...base, kr: kr({ provenance: 'metadata' }) })
    expect(v.provenance).toBe('metadata')
    expect(v.reason.length).toBeGreaterThan(0)
  })

  it('T0 exatamente no início não divide por zero', () => {
    const v = computeOkrStatus({ ...base, kr: kr(), now: T0 })
    expect(['on-track', 'at-risk', 'no-data']).toContain(v.status)
  })
})
