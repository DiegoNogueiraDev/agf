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
import { readEpicKr, type KrRecord, buildKrMetadata } from '../core/evals/okr-kr-source.js'

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

// ── Producer (node_c7a5a82737a8) ──────────────────────────────────────
//
// readEpicKr READS metadata.kr and nothing ever WROTE it: 519 epics, all
// no-data. The reader is correct — absence really is no-data — but a cockpit
// that can only ever report "no data" measures nothing, so the missing half is
// the producer.
//
// Validation happens BEFORE any write. A partially-applied KR (target saved,
// current rejected) would compute an attainment from mixed sources, which is
// worse than refusing: the number would look real.
describe('buildKrMetadata — the write half of the KR contract', () => {
  // O prazo é o que TORNA o veredito possível: sem deadline a régua de ritmo
  // não roda e todo KR morre em 'no-data' — o que deixa `agf okr --at-risk`
  // eternamente vazio, um filtro sobre um domínio que nunca se povoa.
  it('accepts a deadline and carries it through — without it no KR can ever be judged', () => {
    const r = buildKrMetadata({ target: '100', current: '40', deadline: '2026-12-31T00:00:00.000Z' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.kr.deadline).toBe('2026-12-31T00:00:00.000Z')
  })

  it('refuses a deadline that is not a real date, instead of storing a string nobody can parse', () => {
    const r = buildKrMetadata({ target: '100', current: '40', deadline: 'sexta que vem' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('INVALID_KR')
  })

  it('omits deadline entirely when not given — absence stays absence', () => {
    const r = buildKrMetadata({ target: '100', current: '40' })
    expect(r.ok).toBe(true)
    if (r.ok) expect('deadline' in r.kr).toBe(false)
  })

  it('accepts a complete KR and returns exactly what readEpicKr expects', () => {
    const r = buildKrMetadata({ target: '100', current: '40', unit: 'percent' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.kr).toEqual({ target: 100, current: 40, unit: 'percent' })
    // The round trip is the point: what the producer writes, the reader reads.
    expect(readEpicKr({ metadata: { kr: r.kr } } as never).attainment).toBe(0.4)
    expect(readEpicKr({ metadata: { kr: r.kr } } as never).provenance).toBe('metadata')
  })

  it('REFUSES a non-numeric target', () => {
    const r = buildKrMetadata({ target: 'muito', current: '40' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.code).toBe('INVALID_KR')
    expect(r.error).toContain('target')
  })

  it('REFUSES a non-numeric current, naming the field that failed', () => {
    const r = buildKrMetadata({ target: '100', current: 'quase' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('current')
  })

  it('REFUSES infinity and NaN — a finite number or nothing', () => {
    for (const bad of ['Infinity', 'NaN', '']) {
      expect(buildKrMetadata({ target: bad, current: '1' }).ok, `target=${bad}`).toBe(false)
    }
  })

  it('accepts target=0 but reports attainment as null, never a division artefact', () => {
    // Dividing by zero would yield Infinity and render as a wildly on-track KR.
    const r = buildKrMetadata({ target: '0', current: '5' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(readEpicKr({ metadata: { kr: r.kr } } as never).attainment).toBeNull()
  })

  it('omits unit when not given, rather than inventing one', () => {
    const r = buildKrMetadata({ target: '10', current: '5' })
    if (!r.ok) throw new Error('expected ok')
    expect(r.kr.unit).toBeUndefined()
  })
})
