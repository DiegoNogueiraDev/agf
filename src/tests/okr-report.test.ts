/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * Tests for buildOkrReport (node_6334980fc7eb, épico node_fa33f02975c3).
 * Uma linha por épico: objetivo + atingimento do KR + status derivado.
 * Regra do CONTRACT node_62b00f3381b8: épico sem KR estruturado ⇒ 'no-data',
 * NUNCA 'on-track' — o cockpit mostra "sem dado", jamais um falso verde.
 */

import { describe, it, expect } from 'vitest'
import { buildOkrReport } from '../core/okr/okr-report.js'
import type { GraphNode } from '../core/graph/graph-types.js'

const NOW = Date.parse('2026-01-16T00:00:00Z')

function epic(id: string, over: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    type: 'epic',
    title: `EPIC ${id}`,
    status: 'backlog',
    priority: 3,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

/** Épico com KR estruturado em metadata.kr (a fonte que readEpicKr lê). */
function withKr(id: string, kr: Record<string, unknown>): GraphNode {
  return epic(id, { metadata: { kr } })
}

describe('buildOkrReport', () => {
  it('renders one row per epic with objective, attainment and status', () => {
    const rows = buildOkrReport({
      epics: [withKr('e1', { target: 100, current: 80, unit: 'percent', deadline: '2026-02-01T00:00:00Z' })],
      deliveredTasks: 8,
      now: NOW,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].epicId).toBe('e1')
    expect(rows[0].objective).toBe('EPIC e1')
    expect(rows[0].attainment).toBeCloseTo(0.8)
    expect(rows[0].status).toBe('on-track')
  })

  it('epic whose KR has no structured source → no-data, never on-track', () => {
    const rows = buildOkrReport({ epics: [epic('e2')], deliveredTasks: 8, now: NOW })
    expect(rows[0].status).toBe('no-data')
    expect(rows[0].provenance).toBe('unset')
    expect(rows[0].attainment).toBeNull()
  })

  it('insufficient pace → at-risk', () => {
    const rows = buildOkrReport({
      epics: [withKr('e3', { target: 100, current: 5, unit: 'percent', deadline: '2026-02-01T00:00:00Z' })],
      deliveredTasks: 8,
      now: NOW,
    })
    expect(rows[0].status).toBe('at-risk')
  })

  it('no delivered tasks in the window → no-data (no observable pace)', () => {
    const rows = buildOkrReport({
      epics: [withKr('e4', { target: 100, current: 80, unit: 'percent', deadline: '2026-02-01T00:00:00Z' })],
      deliveredTasks: 0,
      now: NOW,
    })
    expect(rows[0].status).toBe('no-data')
  })

  it('every row carries provenance and a reason (auditable, not a bare label)', () => {
    const rows = buildOkrReport({
      epics: [withKr('e5', { target: 10, current: 9, unit: 'builds', deadline: '2026-02-01T00:00:00Z' })],
      deliveredTasks: 3,
      now: NOW,
    })
    expect(rows[0].provenance.length).toBeGreaterThan(0)
    expect(rows[0].reason.length).toBeGreaterThan(0)
  })

  it('atRiskOnly filters to the epics that need attention', () => {
    const rows = buildOkrReport({
      epics: [
        withKr('good', { target: 100, current: 90, unit: 'percent', deadline: '2026-02-01T00:00:00Z' }),
        withKr('bad', { target: 100, current: 2, unit: 'percent', deadline: '2026-02-01T00:00:00Z' }),
      ],
      deliveredTasks: 8,
      now: NOW,
      atRiskOnly: true,
    })
    expect(rows.map((r) => r.epicId)).toEqual(['bad'])
  })

  it('non-epic nodes are ignored (the cockpit is per objective)', () => {
    const task = epic('t1', { type: 'task' })
    const rows = buildOkrReport({ epics: [task], deliveredTasks: 8, now: NOW })
    expect(rows).toHaveLength(0)
  })

  it('empty input → empty report (no crash, no fabricated row)', () => {
    expect(buildOkrReport({ epics: [], deliveredTasks: 0, now: NOW })).toEqual([])
  })
})
