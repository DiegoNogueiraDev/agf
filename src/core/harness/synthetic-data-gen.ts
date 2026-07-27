/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Synthetic Data Generator — QuickCheck-inspired factories from Zod schemas
 *
 * Generates minimal valid data and edge case arrays from Zod v4 schemas.
 * Uses schema introspection to produce type-safe test fixtures.
 *
 * Based on: Property-Based Testing (QuickCheck, Claessen & Hughes, 2000).
 */

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod/v4'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'synthetic-data-gen.ts' })

// ── Types ───────────────────────────────────────────────

type ZodShape = Record<string, z.ZodType>

export interface SynthScanFixture {
  /** Name of the exported Zod object schema. */
  schema: string
  minimal: unknown
  edgeCases: unknown[]
}

export interface SynthScanResult {
  /** Module path as passed in (relative to rootDir). */
  module: string
  /** Names of exported Zod object schemas fixtures were generated for. */
  schemasScanned: string[]
  fixtures: SynthScanFixture[]
}

// ── Minimal Generator ───────────────────────────────────

/**
 * Generate a minimal valid object from a Zod object schema.
 * Produces the simplest data that passes validation.
 */
export function generateMinimal<T extends z.ZodObject<ZodShape>>(schema: T): z.infer<T> {
  const shape = schema.shape
  const resultValue: Record<string, unknown> = {}

  for (const [key, fieldSchema] of Object.entries(shape)) {
    resultValue[key] = generateValueMinimal(fieldSchema)
  }

  return resultValue as z.infer<T>
}

/**
 * Generate a minimal value for any Zod type.
 * Zod v4 uses lowercase type names: "string", "number", "boolean", etc.
 */
function generateValueMinimal(schema: z.ZodType): unknown {
  const typeName = (getZodDef(schema).type as string) ?? ''

  if (typeName === 'optional') return undefined
  if (typeName === 'nullable') return null

  if (typeName === 'string') {
    const checks = getChecks(schema)
    const minLen = checks.min ?? 0
    const maxLen = checks.max ?? 100
    const len = Math.max(minLen, Math.min(5, maxLen))
    return 'a'.repeat(len)
  }

  if (typeName === 'number') {
    const checks = getChecks(schema)
    const min = checks.min ?? 0
    const max = checks.max ?? 100
    return Math.ceil((min + max) / 2)
  }

  if (typeName === 'boolean') return false

  if (typeName === 'enum') {
    const values = getEnumValues(schema)
    return values.length > 0 ? values[0] : 'unknown'
  }

  if (typeName === 'array') return []

  if (typeName === 'object') {
    const shape = (schema as z.ZodObject<ZodShape>).shape
    const objValue: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(shape)) {
      objValue[k] = generateValueMinimal(v)
    }
    return objValue
  }

  if (typeName === 'record') return {}

  return null
}

// ── Edge Case Generator ─────────────────────────────────

/**
 * Generate edge case variants from a Zod object schema.
 * Produces an array of valid objects testing boundary conditions.
 */
export function generateEdgeCase<T extends z.ZodObject<ZodShape>>(schema: T): Array<z.infer<T>> {
  const shape = schema.shape
  const baseMinimal = generateMinimal(schema)
  const cases: Array<z.infer<T>> = []

  for (const [key, fieldSchema] of Object.entries(shape)) {
    const edgeValues = generateEdgeValues(fieldSchema)
    for (const valValue of edgeValues) {
      cases.push({ ...baseMinimal, [key]: valValue })
    }
  }

  // Deduplicate by JSON
  const seen = new Set<string>()
  const unique: Array<z.infer<T>> = []
  for (const cVar of cases) {
    const json = JSON.stringify(cVar)
    if (!seen.has(json)) {
      seen.add(json)
      unique.push(cVar)
    }
  }

  log.debug('synthetic-data-gen:edge-cases', { count: unique.length })
  return unique
}

/**
 * Generate edge case values for a single field.
 */
function generateEdgeValues(schema: z.ZodType): unknown[] {
  const typeName = (getZodDef(schema).type as string) ?? ''

  // Optional → include undefined + inner edges
  if (typeName === 'optional') {
    const inner = getInnerType(schema)
    if (inner) {
      return [undefined, ...generateEdgeValues(inner)]
    }
    return [undefined]
  }

  // Nullable → include null + inner edges
  if (typeName === 'nullable') {
    const inner = getInnerType(schema)
    if (inner) {
      return [null, ...generateEdgeValues(inner)]
    }
    return [null]
  }

  // String — min, max, typical
  if (typeName === 'string') {
    const checks = getChecks(schema)
    const min = checks.min ?? 0
    const max = checks.max ?? 100
    const values: string[] = []
    if (min > 0) values.push('a'.repeat(min))
    if (max < 10000) values.push('a'.repeat(max))
    if (min === 0) values.push('')
    values.push('test-value')
    return values
  }

  // Number — min, max, zero, negative
  if (typeName === 'number') {
    const checks = getChecks(schema)
    const min = checks.min ?? 0
    const max = checks.max ?? 1000
    return [min, max, Math.floor((min + max) / 2)]
  }

  // Boolean — both values
  if (typeName === 'boolean') {
    return [true, false]
  }

  // Enum — all values
  if (typeName === 'enum') {
    return getEnumValues(schema)
  }

  // Array — empty + single element
  if (typeName === 'array') {
    return [[], ['edge-item']]
  }

  return [generateValueMinimal(schema)]
}

// ── Schema Introspection Helpers ────────────────────────

// ── Zod v4 internal access helper ───────────────────────

function getZodDef(schema: z.ZodType): Record<string, unknown> {
  return (schema as unknown as { _zod?: { def?: Record<string, unknown> } })._zod?.def ?? {}
}

/**
 * Extract min/max checks from a Zod v4 schema.
 * Zod v4 stores checks as objects with _zod.def containing the constraint.
 */
function getChecks(schema: z.ZodType): { min?: number; max?: number } {
  const resultValue: { min?: number; max?: number } = {}

  try {
    const schemaDef = getZodDef(schema)
    const checks = schemaDef.checks as Array<unknown> | undefined

    if (checks) {
      for (const check of checks) {
        const checkDef = (check as { _zod?: { def?: Record<string, unknown> } })._zod?.def ?? {}
        const checkType = checkDef.check as string | undefined

        if (checkType === 'min_length') resultValue.min = checkDef.minimum as number
        if (checkType === 'max_length') resultValue.max = checkDef.maximum as number
        if (checkType === 'greater_than') resultValue.min = checkDef.value as number
        if (checkType === 'less_than') resultValue.max = checkDef.value as number
      }
    }
  } catch (err) {
    log.debug('intentional-swallow', { error: String(err), reason: 'graceful fallback for constraint extraction' })
  }

  return resultValue
}

/**
 * Extract enum values from a Zod v4 enum schema.
 * Zod v4 stores entries as { a: "a", b: "b" } object.
 */
function getEnumValues(schema: z.ZodType): string[] {
  try {
    const schemaDef = getZodDef(schema)
    const entries = schemaDef.entries as Record<string, string> | string[] | undefined

    if (entries) {
      if (Array.isArray(entries)) return [...entries]
      return Object.values(entries)
    }
  } catch (err) {
    log.debug('intentional-swallow', { error: String(err), reason: 'graceful fallback for enum values extraction' })
  }
  return []
}

/**
 * Get inner type from Optional/Nullable wrapper.
 */
function getInnerType(schema: z.ZodType): z.ZodType | null {
  try {
    const schemaDef = getZodDef(schema)
    const innerType = schemaDef.innerType as z.ZodType | undefined
    return innerType ?? null
  } catch {
    return null
  }
}

function isZodObjectSchema(value: unknown): value is z.ZodObject<ZodShape> {
  return (value as { _zod?: { def?: Record<string, unknown> } })?._zod?.def?.type === 'object'
}

/**
 * Load `modulePath` (relative to rootDir) and generate minimal + edge-case
 * fixtures for every exported Zod object schema. This is the CLI-facing
 * entry point (`agf harness --synth <module>`).
 */
export async function runSynthScan(rootDir: string, modulePath: string): Promise<SynthScanResult> {
  const abs = resolve(rootDir, modulePath)
  const mod = (await import(pathToFileURL(abs).href)) as Record<string, unknown>

  const schemasScanned: string[] = []
  const fixtures: SynthScanFixture[] = []
  for (const [name, value] of Object.entries(mod)) {
    if (isZodObjectSchema(value)) {
      schemasScanned.push(name)
      fixtures.push({
        schema: name,
        minimal: generateMinimal(value),
        edgeCases: generateEdgeCase(value),
      })
    }
  }

  return { module: modulePath, schemasScanned, fixtures }
}
