/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_a1adf8243c4c — E1.1: caste taxonomy
 *
 * AC: CasteKind = minima|pequena|media|soldado;
 *     each caste has model_tier + max_complexity + task_types[];
 *     agf caste list shows 4 castes
 */

import { describe, it, expect } from 'vitest'
import {
  CASTE_TAXONOMY,
  type CasteKind,
  type CasteDefinition,
  getCasteDefinition,
  listCastes,
} from '../core/colony/caste-taxonomy.js'

// ── Type shape ─────────────────────────────────────────────────────────────────

describe('CasteKind literal union', () => {
  it('has exactly 4 caste kinds', () => {
    const kinds: CasteKind[] = ['minima', 'pequena', 'media', 'soldado']
    expect(kinds).toHaveLength(4)
  })
})

// ── CASTE_TAXONOMY ─────────────────────────────────────────────────────────────

describe('CASTE_TAXONOMY', () => {
  it('contains all 4 castes', () => {
    expect(Object.keys(CASTE_TAXONOMY)).toHaveLength(4)
  })

  it('each caste has model_tier', () => {
    for (const def of Object.values(CASTE_TAXONOMY)) {
      expect(def.model_tier).toBeDefined()
      expect(['cheap', 'build', 'frontier']).toContain(def.model_tier)
    }
  })

  it('each caste has max_complexity (positive number)', () => {
    for (const def of Object.values(CASTE_TAXONOMY)) {
      expect(typeof def.max_complexity).toBe('number')
      expect(def.max_complexity).toBeGreaterThan(0)
    }
  })

  it('each caste has task_types array', () => {
    for (const def of Object.values(CASTE_TAXONOMY)) {
      expect(Array.isArray(def.task_types)).toBe(true)
      expect(def.task_types.length).toBeGreaterThan(0)
    }
  })

  it('minima caste uses cheap model_tier (lowest cost)', () => {
    expect(CASTE_TAXONOMY.minima.model_tier).toBe('cheap')
  })

  it('soldado caste uses frontier model_tier (highest capability)', () => {
    expect(CASTE_TAXONOMY.soldado.model_tier).toBe('frontier')
  })

  it('max_complexity increases from minima to soldado', () => {
    const { minima, pequena, media, soldado } = CASTE_TAXONOMY
    expect(minima.max_complexity).toBeLessThanOrEqual(pequena.max_complexity)
    expect(pequena.max_complexity).toBeLessThanOrEqual(media.max_complexity)
    expect(media.max_complexity).toBeLessThanOrEqual(soldado.max_complexity)
  })
})

// ── getCasteDefinition ─────────────────────────────────────────────────────────

describe('getCasteDefinition', () => {
  it('returns definition for each caste', () => {
    const kinds: CasteKind[] = ['minima', 'pequena', 'media', 'soldado']
    for (const kind of kinds) {
      const def = getCasteDefinition(kind)
      expect(def).toBeDefined()
      expect(def.model_tier).toBeDefined()
    }
  })
})

// ── listCastes ─────────────────────────────────────────────────────────────────

describe('listCastes', () => {
  it('returns 4 caste entries', () => {
    const list = listCastes()
    expect(list).toHaveLength(4)
  })

  it('each entry has caste name, model_tier, max_complexity, task_types', () => {
    const list = listCastes()
    for (const entry of list) {
      expect(entry).toHaveProperty('caste')
      expect(entry).toHaveProperty('model_tier')
      expect(entry).toHaveProperty('max_complexity')
      expect(entry).toHaveProperty('task_types')
    }
  })

  it('includes minima, pequena, media, soldado caste names', () => {
    const list = listCastes()
    const names = list.map((e) => e.caste)
    expect(names).toContain('minima')
    expect(names).toContain('pequena')
    expect(names).toContain('media')
    expect(names).toContain('soldado')
  })
})
