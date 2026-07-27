/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * AUDIT-027/028/030/031/032/029 — boundary coercion guards. Raw, non-numeric or
 * blank argv used to reach the store as NaN/empty and raw-throw (SqliteError /
 * TypeError) instead of an `ok:false` envelope. These pure helpers fix that.
 */

import { describe, it, expect } from 'vitest'
import {
  coerceLimit,
  coerceId,
  coercePriority,
  isBlank,
  errMessage,
  isGraphDocumentShape,
} from '../cli/shared/coerce.js'
import { buildFatalEnvelope } from '../cli/fatal.js'

describe('coerceLimit (AUDIT-027/028)', () => {
  it('keeps a valid numeric string', () => {
    expect(coerceLimit('10', 50)).toBe(10)
  })
  it('falls back on a non-numeric string (no NaN reaches the store)', () => {
    expect(coerceLimit('abc', 50)).toBe(50)
    expect(coerceLimit('NaN', 50)).toBe(50)
  })
  it('falls back on undefined or blank', () => {
    expect(coerceLimit(undefined, 50)).toBe(50)
    expect(coerceLimit('', 50)).toBe(50)
    expect(coerceLimit('   ', 50)).toBe(50)
  })
  it('falls back on Infinity and negatives', () => {
    expect(coerceLimit('Infinity', 20)).toBe(20)
    expect(coerceLimit('-5', 20)).toBe(20)
  })
  it('truncates fractional values to an integer', () => {
    expect(coerceLimit('3.7', 50)).toBe(3)
  })
})

describe('coerceId (AUDIT-030)', () => {
  it('returns a non-negative integer', () => {
    expect(coerceId('7')).toBe(7)
    expect(coerceId('0')).toBe(0)
  })
  it('returns null for non-integer / blank / negative', () => {
    expect(coerceId('abc')).toBeNull()
    expect(coerceId('1.5')).toBeNull()
    expect(coerceId('-3')).toBeNull()
    expect(coerceId('')).toBeNull()
    expect(coerceId(undefined)).toBeNull()
  })
})

describe('coercePriority (AUDIT-032)', () => {
  it('accepts integers 1–5', () => {
    for (const p of [1, 2, 3, 4, 5]) {
      expect(coercePriority(String(p))).toEqual({ ok: true, value: p })
    }
  })
  it('rejects out-of-range, fractional, and non-numeric', () => {
    expect(coercePriority('0')).toEqual({ ok: false })
    expect(coercePriority('6')).toEqual({ ok: false })
    expect(coercePriority('2.5')).toEqual({ ok: false })
    expect(coercePriority('abc')).toEqual({ ok: false })
    expect(coercePriority(undefined)).toEqual({ ok: false })
  })
})

describe('isBlank / errMessage (AUDIT-031)', () => {
  it('detects blank names', () => {
    expect(isBlank(undefined)).toBe(true)
    expect(isBlank('')).toBe(true)
    expect(isBlank('  ')).toBe(true)
    expect(isBlank('x')).toBe(false)
  })
  it('extracts a message from Error and non-Error', () => {
    expect(errMessage(new Error('boom'))).toBe('boom')
    expect(errMessage('plain')).toBe('plain')
  })
})

describe('isGraphDocumentShape (AUDIT-029)', () => {
  it('accepts a well-formed document', () => {
    expect(isGraphDocumentShape({ project: { name: 'p' }, nodes: [], edges: [] })).toBe(true)
  })
  it('rejects arrays, primitives, null, and missing fields', () => {
    expect(isGraphDocumentShape([])).toBe(false)
    expect(isGraphDocumentShape('x')).toBe(false)
    expect(isGraphDocumentShape(null)).toBe(false)
    expect(isGraphDocumentShape({ nodes: [], edges: [] })).toBe(false)
    expect(isGraphDocumentShape({ project: {}, nodes: {}, edges: [] })).toBe(false)
  })
})

describe('buildFatalEnvelope (AUDIT-034)', () => {
  it('wraps an Error in an ok:false / status:fail envelope', () => {
    const env = buildFatalEnvelope(new Error('kaboom'))
    expect(env.ok).toBe(false)
    expect(env.status).toBe('fail')
    expect(env.code).toBe('UNCAUGHT')
    expect(env.error).toBe('kaboom')
    expect(env.meta.command).toBe('agf')
  })
  it('handles string and non-Error throws', () => {
    expect(buildFatalEnvelope('oops').error).toBe('oops')
    expect(buildFatalEnvelope({ a: 1 }).error).toContain('a')
  })
})
