/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes do computeWsjf (node_b9c002916d15) — WSJF = CoD / JobSize, puro e
 * determinístico. CoD de priority + tag MoSCoW + idade; JobSize de
 * estimateMinutes com fallback no mapa xpSize→minutos. Refina o sort do picker
 * VIVO (findNextTask) DENTRO da banda de prioridade — nunca cruza bandas.
 */

import { describe, it, expect } from 'vitest'
import { computeWsjf, XP_SIZE_MINUTES } from '../core/planner/wsjf-score.js'
import { findNextTask } from '../core/planner/next-task.js'
import type { GraphDocument, GraphNode } from '../core/graph/graph-types.js'

const NOW = Date.parse('2026-07-15T00:00:00Z')

function task(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    type: 'task',
    title: `task ${id}`,
    status: 'backlog',
    priority: 2,
    tags: [],
    createdAt: new Date(NOW).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    ...overrides,
  }
}

describe('computeWsjf (pure)', () => {
  it('same JobSize, higher CoD (must vs could) → higher wsjf (AC1)', () => {
    const must = computeWsjf(task('a', { tags: ['must'], xpSize: 'M' }), { nowMs: NOW })
    const could = computeWsjf(task('b', { tags: ['could'], xpSize: 'M' }), { nowMs: NOW })
    expect(must.cod).toBeGreaterThan(could.cod)
    expect(must.wsjf).toBeGreaterThan(could.wsjf)
  })

  it('equal CoD, smaller JobSize → higher wsjf (AC2 tie-break)', () => {
    const small = computeWsjf(task('a', { xpSize: 'S' }), { nowMs: NOW })
    const large = computeWsjf(task('b', { xpSize: 'L' }), { nowMs: NOW })
    expect(small.cod).toBe(large.cod)
    expect(small.wsjf).toBeGreaterThan(large.wsjf)
  })

  it('estimateMinutes absent → falls back to xpSize→minutes map without throwing (AC3)', () => {
    const withEstimate = computeWsjf(task('a', { estimateMinutes: 45 }), { nowMs: NOW })
    expect(withEstimate.jobSize).toBe(45)

    const fallback = computeWsjf(task('b', { xpSize: 'S' }), { nowMs: NOW })
    expect(fallback.jobSize).toBe(XP_SIZE_MINUTES.S)

    const noSize = computeWsjf(task('c'), { nowMs: NOW })
    expect(fallback.jobSize).toBeGreaterThan(0)
    expect(noSize.jobSize).toBe(XP_SIZE_MINUTES.M)
  })

  it('missing/invalid priority → safe default score, no throw (AC4)', () => {
    const invalid = { ...task('a'), priority: undefined } as unknown as GraphNode
    const result = computeWsjf(invalid, { nowMs: NOW })
    expect(Number.isFinite(result.wsjf)).toBe(true)
    expect(result.wsjf).toBeGreaterThan(0)
  })

  it('older task gains CoD (time criticality), deterministically via nowMs', () => {
    const fresh = computeWsjf(task('a'), { nowMs: NOW })
    const old = computeWsjf(task('b', { createdAt: new Date(NOW - 30 * 24 * 3600 * 1000).toISOString() }), {
      nowMs: NOW,
    })
    expect(old.cod).toBeGreaterThan(fresh.cod)
  })
})

describe('findNextTask WSJF refinement (live picker, within priority band)', () => {
  it('same priority band: must beats could (higher CoD ranks first, AC1)', () => {
    const doc: GraphDocument = {
      nodes: [task('n_could', { tags: ['could'], xpSize: 'M' }), task('n_must', { tags: ['must'], xpSize: 'M' })],
      edges: [],
    }
    expect(findNextTask(doc)?.node.id).toBe('n_must')
  })

  it('never crosses priority bands: priority 1 beats a must at priority 2', () => {
    const doc: GraphDocument = {
      nodes: [task('n_p2_must', { priority: 2, tags: ['must'] }), task('n_p1', { priority: 1 })],
      edges: [],
    }
    expect(findNextTask(doc)?.node.id).toBe('n_p1')
  })
})
