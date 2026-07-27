/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * AUDIT-047 [MED]: canonicalJson([]) === canonicalJson([undefined]) because
 * `value.map(canonicalJson).join(',')` coerces a JS `undefined` element to ''.
 * Two distinct argument lists collapse to the same cache key. Fix: normalize
 * undefined → null in the array branch.
 */
import { describe, it, expect } from 'vitest'
import { canonicalJson, buildCacheKey } from '../core/economy/cache/cache-key.js'

describe('AUDIT-047: canonicalJson distinguishes [] from [undefined]', () => {
  it('[] and [undefined] do not serialize to the same string', () => {
    expect(canonicalJson([])).not.toBe(canonicalJson([undefined]))
  })

  it('normalizes an undefined array element to null', () => {
    expect(canonicalJson([])).toBe('[]')
    expect(canonicalJson([undefined])).toBe('[null]')
    expect(canonicalJson([1, undefined, 2])).toBe('[1,null,2]')
  })

  it('produces different cache keys for [] vs [undefined] args', () => {
    const a = buildCacheKey({ toolName: 't', args: [], schemaVersion: 1 })
    const b = buildCacheKey({ toolName: 't', args: [undefined], schemaVersion: 1 })
    expect(a).not.toBe(b)
  })
})
