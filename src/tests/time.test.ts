/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { now } from '../core/utils/time.js'

describe('now', () => {
  it('should return a string', () => {
    expect(typeof now()).toBe('string')
  })

  it('should return an ISO 8601 formatted date', () => {
    const result = now()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('should return a valid date', () => {
    const result = now()
    expect(new Date(result).toISOString()).toBe(result)
  })

  it('should advance on successive calls', () => {
    const t1 = now()
    const t2 = now()
    expect(new Date(t2).getTime()).toBeGreaterThanOrEqual(new Date(t1).getTime())
  })
})
