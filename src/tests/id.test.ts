/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { generateId } from '../core/utils/id.js'

describe('generateId', () => {
  it('should generate an ID with default prefix', () => {
    const id = generateId()
    expect(id).toMatch(/^node_[a-f0-9]{12}$/)
  })

  it('should generate an ID with custom prefix', () => {
    const id = generateId('task')
    expect(id).toMatch(/^task_[a-f0-9]{12}$/)
  })

  it('should generate an ID with empty prefix', () => {
    const id = generateId('')
    expect(id).toMatch(/^_[a-f0-9]{12}$/)
  })

  it('should generate unique IDs on successive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()))
    expect(ids.size).toBe(100)
  })

  it('should contain only hex characters after prefix', () => {
    const id = generateId('test')
    const suffix = id.split('_')[1]
    expect(suffix).toMatch(/^[a-f0-9]{12}$/)
  })
})
