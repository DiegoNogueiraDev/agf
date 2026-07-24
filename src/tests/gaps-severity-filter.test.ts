/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_754040cd2680 — `agf gaps --severity` validava o valor e nunca filtrava.
 *
 * Medido no grafo real: 319 gaps, dos quais 37 são de fato `required`. O flag
 * devolvia os 319 para `--severity required`, e ninguém percebia porque a
 * resposta *parece* certa — é uma lista de gaps, só que a lista errada.
 *
 * O custo não foi cosmético: DUAS tasks do backlog foram escritas sobre esses
 * números ("os 115 required", "os 107 required"), e ambas prescreviam limpeza
 * em massa de dívida que, na severidade real, não era acionável. Um filtro que
 * não filtra não devolve dados a mais — devolve uma afirmação falsa sobre o
 * que é urgente.
 */

import { describe, it, expect } from 'vitest'
import { filterGapsBySeverity } from '../core/gaps/filter-gaps.js'
import type { Gap } from '../core/gaps/gap-types.js'

function gap(kind: string, severity: Gap['severity'], nodeId: string): Gap {
  return { kind, severity, nodeId, evidence: `${kind} em ${nodeId}` } as Gap
}

const MIXED: Gap[] = [
  gap('traceability_break', 'required', 'n1'),
  gap('ac_coverage_break', 'recommended', 'n2'),
  gap('traceability_break', 'recommended', 'n3'),
  gap('missing_edge_case', 'required', 'n4'),
]

describe('filterGapsBySeverity', () => {
  it('keeps only the required ones when asked for required (AC1)', () => {
    const out = filterGapsBySeverity(MIXED, 'required')

    expect(out).toHaveLength(2)
    expect(out.every((g) => g.severity === 'required')).toBe(true)
  })

  it('filters in the other direction too — recommended is not a synonym for "everything" (AC2)', () => {
    const out = filterGapsBySeverity(MIXED, 'recommended')

    expect(out).toHaveLength(2)
    expect(out.every((g) => g.severity === 'recommended')).toBe(true)
  })

  it('returns everything when no severity is requested (AC3 — sem regressão)', () => {
    expect(filterGapsBySeverity(MIXED, undefined)).toHaveLength(MIXED.length)
  })

  it('returns an EMPTY list when nothing matches — never the full set (AC4)', () => {
    // O caso onde um filtro preguiçoso se esconde: devolver tudo quando não há
    // correspondência parece "não quebrar nada" e é exatamente a mentira que
    // este bug produzia.
    const onlyRecommended = MIXED.filter((g) => g.severity === 'recommended')

    expect(filterGapsBySeverity(onlyRecommended, 'required')).toEqual([])
  })

  it('does not mutate the input — the caller keeps the full report', () => {
    const before = MIXED.length
    filterGapsBySeverity(MIXED, 'required')
    expect(MIXED).toHaveLength(before)
  })
})
