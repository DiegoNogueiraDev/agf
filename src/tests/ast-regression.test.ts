/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Task 4.3 — Quality Regression Suite para AST
 *
 * AC:
 * 1. GIVEN suite de 5 arquivos .ts fixturados WHEN AST-compressed
 *    THEN todos exports/imports preservados (determinístico, zero LLM)
 * 2. GIVEN arquivo com função com body WHEN comprimido
 *    THEN body substituído por placeholder BODY_PLACEHOLDER (body drop esperado)
 * 3. GIVEN teste de regressão WHEN falha THEN `agf eval --gate` bloqueia (exit 1)
 *    → validado via checkCiGate returning passes:false
 */

import { describe, it, expect } from 'vitest'
import { astCompressCode } from '../core/economy/code-ast-compress.js'
import { checkCiGate } from '../core/evals/eval-compare.js'
import type { QualityThresholdResult } from '../core/evals/eval-compare.js'

// ─── 5 TypeScript fixtures (deterministic, zero-LLM) ─────────────────────────

const FIXTURE_1_SIMPLE_FUNCTIONS = `
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function readText(path: string): string {
  const content = readFileSync(path, 'utf8')
  const trimmed = content.trim()
  return trimmed
}

export function writeText(path: string, content: string): void {
  writeFileSync(path, content, 'utf8')
}

export function joinPaths(...parts: string[]): string {
  return parts.reduce((acc, p) => join(acc, p), '')
}

function internalHelper(x: number): number {
  return x * 2 + 1
}

export const VERSION = '1.0.0'
`

const FIXTURE_2_CLASS_MODULE = `
import { EventEmitter } from 'node:events'

export interface UserConfig {
  name: string
  role: 'admin' | 'user'
}

export class UserService extends EventEmitter {
  private readonly users: Map<string, UserConfig> = new Map()

  constructor(private readonly prefix: string) {
    super()
    this.users.set('default', { name: 'default', role: 'user' })
  }

  add(id: string, config: UserConfig): void {
    this.users.set(this.prefix + id, config)
    this.emit('add', id)
  }

  get(id: string): UserConfig | undefined {
    return this.users.get(this.prefix + id)
  }

  remove(id: string): boolean {
    const existed = this.users.delete(this.prefix + id)
    if (existed) this.emit('remove', id)
    return existed
  }

  list(): UserConfig[] {
    return Array.from(this.users.values())
  }
}
`

const FIXTURE_3_ARROW_FUNCTIONS = `
import type { ParsedPath } from 'node:path'

export type Transformer<T, U> = (input: T) => U

export const toUpperCase: Transformer<string, string> = (s) => {
  return s.toUpperCase()
}

export const parseNumber = (s: string): number => {
  const n = parseFloat(s)
  if (isNaN(n)) throw new Error(\`Not a number: \${s}\`)
  return n
}

export const buildPath = (parsed: ParsedPath): string => {
  const { dir, name, ext } = parsed
  return \`\${dir}/\${name}\${ext}\`
}

export const identity = <T>(x: T): T => {
  return x
}
`

const FIXTURE_4_TYPES_AND_GENERICS = `
export interface Repository<T extends { id: string }> {
  findById(id: string): T | undefined
  findAll(): T[]
  save(entity: T): void
  delete(id: string): boolean
}

export type Result<T, E extends Error = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E }

export function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}

export function err<E extends Error>(error: E): Result<never, E> {
  return { ok: false, error }
}

export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw result.error
  return result.value
}

export class InMemoryRepository<T extends { id: string }> implements Repository<T> {
  private readonly store = new Map<string, T>()

  findById(id: string): T | undefined {
    return this.store.get(id)
  }

  findAll(): T[] {
    return Array.from(this.store.values())
  }

  save(entity: T): void {
    this.store.set(entity.id, entity)
  }

  delete(id: string): boolean {
    return this.store.delete(id)
  }
}
`

const FIXTURE_5_GETTERS_SETTERS = `
export class BoundedValue {
  private _value: number
  private readonly _min: number
  private readonly _max: number

  constructor(initial: number, min: number, max: number) {
    this._min = min
    this._max = max
    this._value = Math.min(Math.max(initial, min), max)
  }

  get value(): number {
    return this._value
  }

  set value(v: number) {
    this._value = Math.min(Math.max(v, this._min), this._max)
  }

  get min(): number {
    return this._min
  }

  get max(): number {
    return this._max
  }

  increment(by = 1): void {
    this.value = this._value + by
  }

  decrement(by = 1): void {
    this.value = this._value - by
  }
}
`

const FIXTURES = [
  {
    name: 'fixture-simple-functions',
    src: FIXTURE_1_SIMPLE_FUNCTIONS,
    exports: ['readText', 'writeText', 'joinPaths', 'VERSION'],
    imports: ['node:fs', 'node:path'],
  },
  {
    name: 'fixture-class-module',
    src: FIXTURE_2_CLASS_MODULE,
    exports: ['UserService', 'UserConfig'],
    imports: ['node:events'],
  },
  {
    name: 'fixture-arrow-functions',
    src: FIXTURE_3_ARROW_FUNCTIONS,
    exports: ['toUpperCase', 'parseNumber', 'buildPath', 'identity', 'Transformer'],
    imports: ['node:path'],
  },
  {
    name: 'fixture-types-generics',
    src: FIXTURE_4_TYPES_AND_GENERICS,
    exports: ['Repository', 'Result', 'ok', 'err', 'unwrap', 'InMemoryRepository'],
    imports: [],
  },
  { name: 'fixture-getters-setters', src: FIXTURE_5_GETTERS_SETTERS, exports: ['BoundedValue'], imports: [] },
]

// ─── AC1 — exports/imports preserved across all 5 fixtures ────────────────────

describe('AC1 — AST regression: exports/imports preserved across 5 fixtures', () => {
  for (const fixture of FIXTURES) {
    it(`${fixture.name}: exported names still present after compression`, () => {
      const compressed = astCompressCode(fixture.src)
      for (const name of fixture.exports) {
        expect(compressed, `${fixture.name}: missing export "${name}"`).toContain(name)
      }
    })

    if (fixture.imports.length > 0) {
      it(`${fixture.name}: import sources still present after compression`, () => {
        const compressed = astCompressCode(fixture.src)
        for (const imp of fixture.imports) {
          expect(compressed, `${fixture.name}: missing import "${imp}"`).toContain(imp)
        }
      })
    }
  }
})

// ─── AC2 — bodies replaced by placeholder ─────────────────────────────────────

describe('AC2 — AST regression: function bodies replaced by placeholder', () => {
  it('simple functions: bodies dropped, placeholder present', () => {
    const compressed = astCompressCode(FIXTURE_1_SIMPLE_FUNCTIONS)
    expect(compressed).toContain('/* … */')
    expect(compressed).not.toContain('readFileSync(path, ')
  })

  it('class methods: constructor and method bodies dropped', () => {
    const compressed = astCompressCode(FIXTURE_2_CLASS_MODULE)
    expect(compressed).toContain('/* … */')
    expect(compressed).not.toContain("this.users.set('default'")
  })

  it('arrow functions: arrow bodies dropped', () => {
    const compressed = astCompressCode(FIXTURE_3_ARROW_FUNCTIONS)
    expect(compressed).toContain('/* … */')
    expect(compressed).not.toContain('s.toUpperCase()')
  })

  it('getters and setters: accessor bodies dropped', () => {
    const compressed = astCompressCode(FIXTURE_5_GETTERS_SETTERS)
    expect(compressed).toContain('/* … */')
    expect(compressed).not.toContain('Math.min(Math.max(v')
  })

  it('compression result is strictly smaller than source (net gain)', () => {
    for (const fixture of FIXTURES) {
      const compressed = astCompressCode(fixture.src)
      expect(compressed.length, `${fixture.name}: no compression gain`).toBeLessThan(fixture.src.length)
    }
  })
})

// ─── AC3 — eval gate blocks on regression (exit 1 via checkCiGate passes:false) ─

describe('AC3 — eval gate blocks when regression test fails', () => {
  const PASSING_QUALITY: QualityThresholdResult = {
    passes: true,
    total: 5,
    aboveThreshold: 5,
    passRate: 1.0,
    avgScore: 0.95,
  }

  const GATE_OPTS = {
    maxCostRegressionPct: 10,
    minQualityScore: 0.8,
    minQualityPassRate: 0.7,
  }

  it('gate passes when cost is within threshold and quality is good', () => {
    const result = checkCiGate(0.01, PASSING_QUALITY, 0.01, GATE_OPTS)
    expect(result.passes).toBe(true)
    expect(result.failReasons).toHaveLength(0)
  })

  it('gate fails (passes:false) when cost regression exceeds 10%', () => {
    const result = checkCiGate(0.12, PASSING_QUALITY, 0.1, GATE_OPTS)
    expect(result.passes).toBe(false)
    expect(result.failReasons.length).toBeGreaterThan(0)
    expect(result.failReasons[0]).toContain('cost regression')
  })

  it('gate fails when quality pass rate is below threshold', () => {
    const poorQuality: QualityThresholdResult = {
      passes: false,
      total: 5,
      aboveThreshold: 2,
      passRate: 0.4,
      avgScore: 0.65,
    }
    const result = checkCiGate(0.01, poorQuality, 0.01, GATE_OPTS)
    expect(result.passes).toBe(false)
    expect(result.failReasons.some((r) => r.includes('quality'))).toBe(true)
  })

  it('gate skips cost check when no baseline exists (first run)', () => {
    const result = checkCiGate(999.99, PASSING_QUALITY, null, GATE_OPTS)
    expect(result.passes).toBe(true)
    expect(result.costRegressionPct).toBeNull()
  })
})
