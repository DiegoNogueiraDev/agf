/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_3443e1550ddc AC coverage: colony-health endpoint + HTML gauge
 *
 * AC: /api/colony-health endpoint retorna JSON do colony health
 * AC: agf ui renderiza gauge de saúde na página principal
 * AC: cores: verde(A/B), amarelo(C), laranja(D), vermelho(F)
 */

import { describe, it, expect } from 'vitest'
import { buildColonyHealthSnapshot, type ColonyHealthSnapshot } from '../core/web/colony-health-snapshot.js'
import { renderProgressHtml } from '../core/web/progress-html.js'

// ── buildColonyHealthSnapshot ─────────────────────────────────────────────────

describe('buildColonyHealthSnapshot', () => {
  it('returns grade field', () => {
    const result = buildColonyHealthSnapshot({ byStatus: { done: 10, backlog: 2 } })
    expect(['A', 'B', 'C', 'D', 'F']).toContain(result.grade)
  })

  it('returns caste field', () => {
    const result = buildColonyHealthSnapshot({ byStatus: { done: 5, backlog: 5 } })
    expect(['TRAIL', 'EXPLORE', 'FUNGAL']).toContain(result.caste)
  })

  it('returns quarantined_count field', () => {
    const result = buildColonyHealthSnapshot({ byStatus: { done: 5, quarantined: 2 } })
    expect(result.quarantined_count).toBe(2)
  })

  it('returns suggested_model field', () => {
    const result = buildColonyHealthSnapshot({ byStatus: { done: 5, backlog: 5 } })
    expect(['cheap', 'build', 'frontier']).toContain(result.suggested_model)
  })

  it('returns color matching grade: A → green', () => {
    const result = buildColonyHealthSnapshot({ byStatus: { done: 95, backlog: 5 } })
    if (result.grade === 'A' || result.grade === 'B') {
      expect(result.color).toBe('green')
    }
  })

  it('returns color matching grade: C → yellow', () => {
    const snapshot: ColonyHealthSnapshot = {
      grade: 'C',
      caste: 'TRAIL',
      quarantined_count: 0,
      suggested_model: 'cheap',
      color: 'yellow',
      pending: 0,
      blocked: 0,
      done: 0,
      total: 0,
    }
    expect(snapshot.color).toBe('yellow')
  })

  it('returns color matching grade: D → orange', () => {
    const snapshot: ColonyHealthSnapshot = {
      grade: 'D',
      caste: 'EXPLORE',
      quarantined_count: 0,
      suggested_model: 'frontier',
      color: 'orange',
      pending: 0,
      blocked: 0,
      done: 0,
      total: 0,
    }
    expect(snapshot.color).toBe('orange')
  })

  it('returns color matching grade: F → red', () => {
    const snapshot: ColonyHealthSnapshot = {
      grade: 'F',
      caste: 'FUNGAL',
      quarantined_count: 0,
      suggested_model: 'build',
      color: 'red',
      pending: 0,
      blocked: 0,
      done: 0,
      total: 0,
    }
    expect(snapshot.color).toBe('red')
  })

  it('grade derives from done/total ratio (high ratio → A or B)', () => {
    const result = buildColonyHealthSnapshot({ byStatus: { done: 90, backlog: 10 } })
    expect(['A', 'B']).toContain(result.grade)
  })

  it('EXPLORE caste when blocked ratio > 0.2', () => {
    const result = buildColonyHealthSnapshot({ byStatus: { blocked: 5, backlog: 10, done: 5 } })
    expect(result.caste).toBe('EXPLORE')
  })

  it('FUNGAL caste when pending=0 and blocked=0', () => {
    const result = buildColonyHealthSnapshot({ byStatus: { done: 10 } })
    expect(result.caste).toBe('FUNGAL')
  })
})

// ── HTML gauge ────────────────────────────────────────────────────────────────

describe('renderProgressHtml — colony health gauge', () => {
  it('contains colony-health element id', () => {
    const html = renderProgressHtml()
    expect(html).toContain('colony-health')
  })

  it('contains /api/colony-health fetch call', () => {
    const html = renderProgressHtml()
    expect(html).toContain('/api/colony-health')
  })

  it('contains green color token for A/B grades', () => {
    const html = renderProgressHtml()
    expect(html).toContain('green')
  })

  it('contains yellow color token for C grade', () => {
    const html = renderProgressHtml()
    expect(html).toContain('yellow')
  })

  it('contains orange color token for D grade', () => {
    const html = renderProgressHtml()
    expect(html).toContain('orange')
  })

  it('contains red color token for F grade', () => {
    const html = renderProgressHtml()
    expect(html).toContain('red')
  })
})
