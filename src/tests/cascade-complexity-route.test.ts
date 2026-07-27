/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  initialTierForComplexity,
  effectiveCascadeTiers,
  DEFAULT_INITIAL_TIER,
} from '../core/model-hub/cascade-policy.js'
import { buildCascadeWire } from '../core/model-hub/provider-context.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { resolveTierModel } from '../core/model-hub/tier-router.js'
import { ECONOMY_LEVERS_SETTING_KEY } from '../core/economy/economy-levers-config.js'
import type { GraphNode } from '../core/graph/graph-types.js'

describe('initialTierForComplexity — deterministic complexity->tier rule', () => {
  it('routes an L task to the frontier tier', () => {
    // Given an L task, When routing, Then the initial tier is frontier
    expect(initialTierForComplexity('L')).toBe('frontier')
  })

  it('routes an XL task to the frontier tier', () => {
    // Given an XL task, When routing, Then the initial tier is frontier
    expect(initialTierForComplexity('XL')).toBe('frontier')
  })

  it('keeps XS/S/M at the current initial tier (byte-identical, non-regression)', () => {
    // Given an XS/S task, When routing, Then behavior is byte-identical to current
    expect(initialTierForComplexity('XS')).toBe(DEFAULT_INITIAL_TIER)
    expect(initialTierForComplexity('S')).toBe(DEFAULT_INITIAL_TIER)
    expect(initialTierForComplexity('M')).toBe(DEFAULT_INITIAL_TIER)
  })

  it('does not upgrade M — only L/XL escalate the initial tier', () => {
    expect(initialTierForComplexity('M')).not.toBe('frontier')
  })

  it('falls back to the current tier for a missing xpSize without error', () => {
    // Given a node with a missing xpSize, When routing, Then it falls back to the current tier
    expect(initialTierForComplexity(undefined)).toBe(DEFAULT_INITIAL_TIER)
  })

  it('falls back to the current tier for an invalid xpSize without error', () => {
    // Given a node with an invalid xpSize, When routing, Then it falls back to the current tier
    expect(initialTierForComplexity('HUGE')).toBe(DEFAULT_INITIAL_TIER)
    expect(initialTierForComplexity('')).toBe(DEFAULT_INITIAL_TIER)
    expect(initialTierForComplexity('l')).toBe(DEFAULT_INITIAL_TIER) // case-sensitive: lowercase is invalid
  })

  it('honors an explicit default tier override for non-escalating sizes', () => {
    expect(initialTierForComplexity('S', 'build')).toBe('build')
    expect(initialTierForComplexity('L', 'build')).toBe('frontier')
  })
})

describe('effectiveCascadeTiers — the cascade starts at the complexity-selected tier', () => {
  const TIERS = ['cheap', 'frontier'] as const

  it('drops the cheap draft for an L/XL node — cascade is frontier-first', () => {
    expect(effectiveCascadeTiers(TIERS, 'L')).toEqual(['frontier'])
    expect(effectiveCascadeTiers(TIERS, 'XL')).toEqual(['frontier'])
  })

  it('keeps the full tier list for XS/S/M (byte-identical, non-regression)', () => {
    expect(effectiveCascadeTiers(TIERS, 'S')).toEqual(['cheap', 'frontier'])
    expect(effectiveCascadeTiers(TIERS, 'M')).toEqual(['cheap', 'frontier'])
  })

  it('keeps the full tier list for a missing/invalid xpSize (safe fallback)', () => {
    expect(effectiveCascadeTiers(TIERS, undefined)).toEqual(['cheap', 'frontier'])
    expect(effectiveCascadeTiers(TIERS, 'HUGE')).toEqual(['cheap', 'frontier'])
  })

  it('is byte-identical to the input when the initial tier is already first', () => {
    // slicing from index 0 must not clone-reorder — same content, order preserved
    expect(effectiveCascadeTiers(['cheap', 'build', 'frontier'], 'S')).toEqual(['cheap', 'build', 'frontier'])
  })
})

describe('buildCascadeWire — L/XL nodes route frontier-first (the wire)', () => {
  function storeWithNode(xpSize: GraphNode['xpSize']): SqliteStore {
    const store = SqliteStore.open(':memory:')
    store.initProject('cascade-route-test')
    // Cascade lever ON — otherwise the wire is null (byte-identical default-OFF path).
    store.setProjectSetting(ECONOMY_LEVERS_SETTING_KEY, JSON.stringify({ cascade: { enabled: true } }))
    const now = new Date().toISOString()
    store.insertNode({
      id: 'node_route',
      type: 'task',
      title: 'route',
      status: 'in_progress',
      priority: 2,
      xpSize,
      acceptanceCriteria: ['Given X, When Y, Then Z'],
      tags: [],
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
    return store
  }

  it('an L node produces a frontier-first model list (cheap draft skipped)', () => {
    const store = storeWithNode('L')
    const wire = buildCascadeWire(store, store.getDb())
    store.close()
    expect(wire).not.toBeNull()
    expect(wire!.models).toEqual([resolveTierModel('frontier')])
  })

  it('an S node keeps the current cheap-first model order (byte-identical)', () => {
    const store = storeWithNode('S')
    const wire = buildCascadeWire(store, store.getDb())
    store.close()
    expect(wire).not.toBeNull()
    expect(wire!.models).toEqual([resolveTierModel('cheap'), resolveTierModel('frontier')])
  })
})
