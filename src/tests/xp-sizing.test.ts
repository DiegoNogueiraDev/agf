/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { XP_SIZE_ORDER, XP_SIZE_POINTS } from '../core/utils/xp-sizing.js'

describe('XP_SIZE_ORDER', () => {
  it('should have correct ordinal values', () => {
    expect(XP_SIZE_ORDER.XS).toBe(1)
    expect(XP_SIZE_ORDER.S).toBe(2)
    expect(XP_SIZE_ORDER.M).toBe(3)
    expect(XP_SIZE_ORDER.L).toBe(4)
    expect(XP_SIZE_ORDER.XL).toBe(5)
  })

  it('should be in ascending order', () => {
    const values = Object.values(XP_SIZE_ORDER)
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1])
    }
  })

  it('should have exactly 5 entries', () => {
    expect(Object.keys(XP_SIZE_ORDER).length).toBe(5)
  })
})

describe('XP_SIZE_POINTS', () => {
  it('should have correct fibonacci-like values', () => {
    expect(XP_SIZE_POINTS.XS).toBe(1)
    expect(XP_SIZE_POINTS.S).toBe(2)
    expect(XP_SIZE_POINTS.M).toBe(3)
    expect(XP_SIZE_POINTS.L).toBe(5)
    expect(XP_SIZE_POINTS.XL).toBe(8)
  })

  it('L and XL should differ from ORDER (non-linear scaling)', () => {
    expect(XP_SIZE_POINTS.L).not.toBe(XP_SIZE_ORDER.L)
    expect(XP_SIZE_POINTS.XL).not.toBe(XP_SIZE_ORDER.XL)
  })

  it('should have exactly 5 entries', () => {
    expect(Object.keys(XP_SIZE_POINTS).length).toBe(5)
  })
})
