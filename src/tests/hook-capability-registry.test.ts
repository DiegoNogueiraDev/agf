/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { HOOK_TAXONOMY_POINTS } from '../core/hooks/hook-types.js'
import {
  HOOK_CAPABILITY_REGISTRY,
  ownerOf,
  unmappedPoints,
  UnmappedHookPointError,
} from '../core/hooks/hook-capability-registry.js'

describe('HOOK_CAPABILITY_REGISTRY — coverage', () => {
  it('maps every taxonomy point to an owner', () => {
    expect(unmappedPoints()).toEqual([])
    expect(Object.keys(HOOK_CAPABILITY_REGISTRY)).toHaveLength(29)
    for (const point of HOOK_TAXONOMY_POINTS) {
      expect(HOOK_CAPABILITY_REGISTRY[point]).toBeDefined()
    }
  })

  it('names a real owner module + capability for every point', () => {
    for (const point of HOOK_TAXONOMY_POINTS) {
      const owner = ownerOf(point)
      expect(owner.module).toMatch(/^src\/core\/.+\.ts$/)
      expect(owner.capability.length).toBeGreaterThan(0)
    }
  })

  it('every owner module exists on disk (no drift)', () => {
    for (const point of HOOK_TAXONOMY_POINTS) {
      const owner = ownerOf(point)
      expect(existsSync(resolve(process.cwd(), owner.module)), `${point} → ${owner.module}`).toBe(true)
    }
  })

  it('ownerOf throws a typed error for an unknown point', () => {
    // @ts-expect-error — ponto inexistente é erro de tipo em compile-time
    expect(() => ownerOf('nope_unknown')).toThrow(UnmappedHookPointError)
  })
})
