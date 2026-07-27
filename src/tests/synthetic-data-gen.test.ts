/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod/v4'
import { generateMinimal, generateEdgeCase, runSynthScan } from '../core/harness/synthetic-data-gen.js'

const TestSchema = z.object({
  name: z.string().min(1).max(50),
  age: z.number().min(0).max(150),
  active: z.boolean(),
})

const SimpleSchema = z.object({
  value: z.string(),
  count: z.number(),
})

const EnumSchema = z.object({
  role: z.enum(['admin', 'user', 'guest']),
})

const OptionalSchema = z.object({
  name: z.string(),
  nickname: z.string().optional(),
})

const NestedSchema = z.object({
  user: z.object({
    name: z.string(),
    age: z.number(),
  }),
})

describe('synthetic-data-gen — generateMinimal', () => {
  it('should generate an object matching the schema shape', () => {
    const data = generateMinimal(TestSchema)
    expect(data).toHaveProperty('name')
    expect(data).toHaveProperty('age')
    expect(data).toHaveProperty('active')
  })

  it('should generate valid data for all fields', () => {
    const data = generateMinimal(SimpleSchema)
    expect(typeof data.value).toBe('string')
    expect(typeof data.count).toBe('number')
  })

  it('should pick first enum value', () => {
    const data = generateMinimal(EnumSchema)
    expect(data.role).toBe('admin')
  })

  it('should skip optional fields', () => {
    const data = generateMinimal(OptionalSchema)
    expect(data.name).toBeTruthy()
    expect(data.nickname).toBeUndefined()
  })

  it('should handle nested object schemas', () => {
    const data = generateMinimal(NestedSchema)
    expect(data.user).toHaveProperty('name')
    expect(data.user).toHaveProperty('age')
  })

  it('should return valid data that passes schema parsing', () => {
    const data = generateMinimal(TestSchema)
    const parsed = TestSchema.safeParse(data)
    expect(parsed.success).toBe(true)
  })
})

describe('synthetic-data-gen — generateEdgeCase', () => {
  it('should return an array of edge case objects', () => {
    const cases = generateEdgeCase(TestSchema)
    expect(Array.isArray(cases)).toBe(true)
    expect(cases.length).toBeGreaterThan(0)
  })

  it('should include boundary values for strings (min/max length)', () => {
    const cases = generateEdgeCase(SimpleSchema)
    const values = cases.map((c) => c.value)
    expect(values).toContain('')
    expect(values).toContain('test-value')
  })

  it('should include min, max, and mid values for numbers', () => {
    const cases = generateEdgeCase(z.object({ score: z.number().min(0).max(100) }))
    const values = cases.map((c) => c.score)
    expect(values).toContain(0)
    expect(values).toContain(100)
  })

  it('should include all enum values', () => {
    const cases = generateEdgeCase(EnumSchema)
    const roles = cases.map((c) => c.role)
    expect(roles).toContain('admin')
    expect(roles).toContain('user')
    expect(roles).toContain('guest')
  })

  it('should include undefined for optional fields', () => {
    const cases = generateEdgeCase(OptionalSchema)
    const nicknames = cases.map((c) => c.nickname)
    expect(nicknames).toContain(undefined)
  })

  it('should deduplicate edge cases', () => {
    const cases = generateEdgeCase(EnumSchema)
    const unique = new Set(cases.map((c) => JSON.stringify(c)))
    expect(unique.size).toBe(cases.length)
  })

  it('should handle boolean fields', () => {
    const cases = generateEdgeCase(z.object({ flag: z.boolean() }))
    const flags = cases.map((c) => c.flag)
    expect(flags).toContain(true)
    expect(flags).toContain(false)
  })

  it('should produce valid data that passes schema parsing', () => {
    const cases = generateEdgeCase(TestSchema)
    for (const c of cases) {
      const parsed = TestSchema.safeParse(c)
      expect(parsed.success).toBe(true)
    }
  })
})

describe('runSynthScan: wires generateMinimal/generateEdgeCase to a real module on disk (node_wire_a2af6fe7faa4)', () => {
  it('generates minimal + edge-case fixtures for every exported Zod object schema', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-synth-scan-'))
    try {
      const modulePath = join(dir, 'schemas.mjs')
      writeFileSync(
        modulePath,
        [
          "import { z } from 'zod/v4'",
          'export const UserSchema = z.object({ name: z.string().min(1).max(20), age: z.number().min(0).max(120) })',
          'export const notASchema = 42',
        ].join('\n'),
      )

      const result = await runSynthScan(dir, 'schemas.mjs')

      expect(result.schemasScanned).toEqual(['UserSchema'])
      expect(result.fixtures).toHaveLength(1)
      const [fixture] = result.fixtures
      expect(fixture.schema).toBe('UserSchema')
      expect(fixture.minimal).toHaveProperty('name')
      expect(fixture.minimal).toHaveProperty('age')
      expect(fixture.edgeCases.length).toBeGreaterThan(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns an empty scan for a module with no Zod object exports', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-synth-scan-empty-'))
    try {
      writeFileSync(join(dir, 'plain.mjs'), 'export const x = 1\n')

      const result = await runSynthScan(dir, 'plain.mjs')

      expect(result.schemasScanned).toEqual([])
      expect(result.fixtures).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
