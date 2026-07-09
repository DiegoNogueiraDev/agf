/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { routeContent } from '../core/economy/content-router.js'

describe('content-router smart-crush (homogeneous JSON arrays)', () => {
  it('crushes a large homogeneous array ≥70% and emits _fields_ + _exemplar_', () => {
    // Arrange — 1000 objects sharing the exact same key set
    const items: Array<Record<string, unknown>> = []
    for (let i = 0; i < 1000; i++) {
      items.push({ id: i, name: `user-${i}`, active: i % 2 === 0 })
    }
    const input = JSON.stringify(items)

    // Act
    const result = routeContent(input)

    // Assert
    expect(result.contentType).toBe('json')
    expect(result.compressor).toBe('json-summarizer')
    expect(result.output.length).toBeLessThanOrEqual(input.length * 0.3)

    const parsed = JSON.parse(result.output) as Record<string, unknown>
    expect(parsed._type_).toBe('array[1000]')
    expect(parsed._exemplar_).toEqual({ id: 0, name: 'user-0', active: true })
    expect(parsed._fields_).toEqual({
      id: 'number',
      name: 'string',
      active: 'boolean',
    })
  })

  it('records mixed value types per field as a union ("type|type")', () => {
    // Arrange — homogeneous key set, but `note` is sometimes null
    const items: Array<Record<string, unknown>> = []
    for (let i = 0; i < 500; i++) {
      items.push({ id: i, note: i % 2 === 0 ? `n-${i}` : null })
    }
    const input = JSON.stringify(items)

    // Act
    const result = routeContent(input)

    // Assert
    const parsed = JSON.parse(result.output) as Record<string, unknown>
    const fields = parsed._fields_ as Record<string, string>
    expect(fields.id).toBe('number')
    // union of observed types, order-independent
    expect(fields.note.split('|').sort()).toEqual(['null', 'string'])
  })

  it('output round-trips through JSON.parse and is never larger than input', () => {
    // Arrange
    const items: Array<Record<string, unknown>> = []
    for (let i = 0; i < 1000; i++) {
      items.push({ id: i, value: i * 3 })
    }
    const input = JSON.stringify(items)

    // Act
    const result = routeContent(input)

    // Assert
    expect(() => JSON.parse(result.output)).not.toThrow()
    expect(result.output.length).toBeLessThanOrEqual(input.length)
  })

  it('falls back to schema summary for a heterogeneous array (different shapes)', () => {
    // Arrange — same length, but element shapes diverge
    const items: Array<Record<string, unknown>> = []
    for (let i = 0; i < 500; i++) {
      items.push(i % 2 === 0 ? { id: i, name: `a-${i}` } : { other: i, extra: true })
    }
    const input = JSON.stringify(items)

    // Act
    const result = routeContent(input)

    // Assert — must NOT use the _fields_ crush; keep prior _first_ summary
    const parsed = JSON.parse(result.output) as Record<string, unknown>
    expect(parsed._fields_).toBeUndefined()
    expect(parsed._exemplar_).toBeUndefined()
    expect(parsed._first_).toBeDefined()
    expect(parsed._type_).toBe('array[500]')
    expect(result.output.length).toBeLessThanOrEqual(input.length)
  })

  it('falls back to _first_ summary for an array of primitives', () => {
    // Arrange — large array of numbers (not objects)
    const items: number[] = []
    for (let i = 0; i < 1000; i++) items.push(i)
    const input = JSON.stringify(items)

    // Act
    const result = routeContent(input)

    // Assert
    const parsed = JSON.parse(result.output) as Record<string, unknown>
    expect(parsed._fields_).toBeUndefined()
    expect(parsed._first_).toBeDefined()
    expect(parsed._type_).toBe('array[1000]')
  })

  it('falls back to schema summary for a plain (non-array) object', () => {
    // Arrange — a large object whose values dwarf the schema, so the object
    // branch genuinely compresses (not an array → no _fields_ crush).
    const obj: Record<string, unknown> = {}
    for (let i = 0; i < 20; i++) obj[`key_${i}`] = 'x'.repeat(40)
    const input = JSON.stringify(obj)

    // Act
    const result = routeContent(input)

    // Assert
    const parsed = JSON.parse(result.output) as Record<string, unknown>
    expect(parsed._fields_).toBeUndefined()
    expect(parsed._schema_).toBeDefined()
    expect(result.output.length).toBeLessThanOrEqual(input.length)
  })

  it('passes small JSON below JSON_MIN_COMPRESS through unchanged', () => {
    // Arrange — homogeneous array but well under 256 bytes
    const input = JSON.stringify([{ id: 1 }, { id: 2 }])

    // Act
    const result = routeContent(input)

    // Assert — no crush, unchanged
    expect(result.output).toBe(input)
  })
})
