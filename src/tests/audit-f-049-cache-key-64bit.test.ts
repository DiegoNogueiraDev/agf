/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * AUDIT-049 [MED]: command-output cache lookup keys used a 32-bit FNV digest,
 * risking collisions that serve the wrong cached output. A collision-resistant
 * 64-bit variant must be available for lookup keys. The orchestrator's primary
 * lookup composer (`composeKey`) is already 64-bit; the tui exposes
 * `composeCacheKey64` as the 64-bit lookup composer for callers to adopt.
 *
 * NOTE (PARTIAL): the live tui lookup wiring (session-cache.ts:133) and the
 * existing 32-bit width assertions live OUTSIDE this agent's ownership; this
 * test locks in the collision-resistant 64-bit path that is in scope.
 */
import { describe, it, expect } from 'vitest'
import { composeCacheKey64, composeCacheKey, type GraphFingerprint } from '../tui/slash/cache-key-composer.js'
import { cacheOrchestrator } from '../core/cache/cache-orchestrator.js'

const fp: GraphFingerprint = { totalNodes: 3, byStatus: { done: 1, backlog: 2 }, lastMutationTs: 7 }

describe('AUDIT-049: collision-resistant 64-bit lookup keys are available', () => {
  it('tui composeCacheKey64 yields a 16-hex (64-bit) key', () => {
    const k = composeCacheKey64('stats', '', fp, 1)
    expect(k).toMatch(/^[0-9a-f]{16}$/)
  })

  it('cacheOrchestrator.composeKey (the lookup path) is already 64-bit', () => {
    const k = cacheOrchestrator.composeKey('stats', {}, 1)
    expect(k).toMatch(/^[0-9a-f]{16}$/)
  })

  it('the 64-bit composer is deterministic and discriminates inputs', () => {
    expect(composeCacheKey64('stats', '', fp, 1)).toBe(composeCacheKey64('stats', '', fp, 1))
    expect(composeCacheKey64('stats', '', fp, 1)).not.toBe(composeCacheKey64('metrics', '', fp, 1))
  })

  it('the 64-bit lookup key is wider than the legacy 32-bit form', () => {
    expect(composeCacheKey64('stats', '', fp, 1).length).toBeGreaterThan(composeCacheKey('stats', '', fp, 1).length)
  })
})
