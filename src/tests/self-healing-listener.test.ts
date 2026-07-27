/*!
 * Tests for self-healing-listener.ts — pure error categorization functions.
 *
 * Three pure exports: categorizeError, generateErrorHash, buildHealingMemory.
 * No event bus, no filesystem, no DB dependency.
 *
 * Covers: category mapping (type/validation/database/build/test/module/general),
 * hash determinism + normalization, and healing memory string structure.
 */

import { describe, it, expect } from 'vitest'
import { categorizeError, generateErrorHash, buildHealingMemory } from '../core/skills/self-healing-listener.js'

// ── categorizeError ───────────────────────────────────────────────────────────

describe('categorizeError', () => {
  it('categorizes validation-related messages as validation-error', () => {
    expect(categorizeError('validation failed: missing required field')).toBe('validation-error')
  })

  it('categorizes database messages as database-error', () => {
    expect(categorizeError('database connection failed: SQLITE_ERROR')).toBe('database-error')
  })

  it('categorizes build messages as build-error', () => {
    expect(categorizeError('build failed: compilation error in module')).toBe('build-error')
  })

  it('categorizes test failures as test-failure', () => {
    expect(categorizeError('testfailed: 3 assertions did not pass')).toBe('test-failure')
  })

  it('categorizes module-related messages as module-error', () => {
    expect(categorizeError('Cannot find module src/core/graph')).toBe('module-error')
  })

  it('categorizes type error messages as type-error', () => {
    expect(categorizeError('type error: Argument of type string is not assignable')).toBe('type-error')
  })

  it('categorizes type mismatch messages as type-error', () => {
    expect(categorizeError('Type mismatch: expected number got string')).toBe('type-error')
  })

  it('returns general-error for unknown messages', () => {
    expect(categorizeError('something unexpected happened')).toBe('general-error')
  })

  it('returns general-error for empty message', () => {
    expect(categorizeError('')).toBe('general-error')
  })
})

// ── generateErrorHash ─────────────────────────────────────────────────────────

describe('generateErrorHash', () => {
  it('returns a 12-character hex string', () => {
    const hash = generateErrorHash('build-error', 'compilation failed')
    expect(hash).toMatch(/^[a-f0-9]{12}$/)
  })

  it('is deterministic — same inputs yield same hash', () => {
    const h1 = generateErrorHash('type-error', 'type mismatch in parser')
    const h2 = generateErrorHash('type-error', 'type mismatch in parser')
    expect(h1).toBe(h2)
  })

  it('different categories produce different hashes', () => {
    const h1 = generateErrorHash('build-error', 'same message')
    const h2 = generateErrorHash('test-failure', 'same message')
    expect(h1).not.toBe(h2)
  })

  it('strips timestamps before hashing (deduplication)', () => {
    const msg1 = 'error at 2026-06-23T12:00:00Z'
    const msg2 = 'error at 2026-06-24T09:30:00Z'
    const h1 = generateErrorHash('general-error', msg1)
    const h2 = generateErrorHash('general-error', msg2)
    expect(h1).toBe(h2)
  })

  it('strips line numbers before hashing (deduplication)', () => {
    const h1 = generateErrorHash('build-error', 'error at line 42')
    const h2 = generateErrorHash('build-error', 'error at line 99')
    expect(h1).toBe(h2)
  })
})

// ── buildHealingMemory ────────────────────────────────────────────────────────

describe('buildHealingMemory', () => {
  it('includes the category in the heading', () => {
    const mem = buildHealingMemory('build-error', 'compilation failed', 'build-tool')
    expect(mem).toContain('build-error')
  })

  it('includes the error message in the output', () => {
    const mem = buildHealingMemory('test-failure', 'test suite crashed', 'vitest')
    expect(mem).toContain('test suite crashed')
  })

  it('includes the tool name in the output', () => {
    const mem = buildHealingMemory('module-error', 'module not found', 'ts-compiler')
    expect(mem).toContain('ts-compiler')
  })

  it('returns a non-empty markdown string', () => {
    const mem = buildHealingMemory('validation-error', 'schema invalid', 'zod')
    expect(mem.length).toBeGreaterThan(50)
    expect(mem).toContain('#')
  })

  it('contains a Prevention Rule section', () => {
    const mem = buildHealingMemory('database-error', 'connection refused', 'sqlite')
    expect(mem).toContain('Prevention Rule')
  })
})
