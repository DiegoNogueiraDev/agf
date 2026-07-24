/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import {
  skeletonizeCode,
  buildSkeletonizePlan,
  buildSkeletonizeReport,
} from '../core/analyzer/adaptive-skeletonizer.js'
import { CodeStore } from '../core/code/code-store.js'

const PROJECT_ID = 'test_project'

function createCodeStore(): CodeStore {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS code_symbols (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL,
      name        TEXT NOT NULL,
      kind        TEXT NOT NULL,
      file        TEXT NOT NULL,
      start_line  INTEGER NOT NULL,
      end_line    INTEGER NOT NULL,
      exported    INTEGER NOT NULL DEFAULT 0,
      module_path TEXT,
      signature   TEXT,
      metadata    TEXT,
      language    TEXT DEFAULT 'typescript',
      docstring   TEXT,
      source_snippet TEXT,
      visibility  TEXT DEFAULT 'public',
      indexed_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS code_relations (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL,
      from_symbol TEXT NOT NULL REFERENCES code_symbols(id),
      to_symbol   TEXT NOT NULL REFERENCES code_symbols(id),
      type        TEXT NOT NULL,
      file        TEXT,
      line        INTEGER,
      metadata    TEXT,
      indexed_at  TEXT NOT NULL
    );
  `)
  return new CodeStore(db)
}

function insertSymbols(
  store: CodeStore,
  symbols: Array<{ id: string; name: string; kind: string; file: string }>,
): void {
  const db = (store as any).db as Database.Database
  const stmt = db.prepare(
    `INSERT INTO code_symbols (id, project_id, name, kind, file, start_line, end_line, indexed_at)
     VALUES (?, ?, ?, ?, ?, 1, 5, datetime('now'))`,
  )
  for (const s of symbols) {
    stmt.run(s.id, PROJECT_ID, s.name, s.kind, s.file)
  }
}

function insertRelations(
  store: CodeStore,
  relations: Array<{ id: string; fromSymbol: string; toSymbol: string; type: string; file?: string }>,
): void {
  const db = (store as any).db as Database.Database
  const stmt = db.prepare(
    `INSERT INTO code_relations (id, project_id, from_symbol, to_symbol, type, file, indexed_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
  )
  for (const r of relations) {
    stmt.run(r.id, PROJECT_ID, r.fromSymbol, r.toSymbol, r.type, r.file ?? null)
  }
}

describe('skeletonizeCode', () => {
  it('replaces class body with stub', () => {
    const source = `class StripePayment implements IPayment {
  process(): void {
    const fee = 0.03
    console.log(fee)
  }
}`
    const result = skeletonizeCode(source, [{ name: 'StripePayment', line: 1 }])
    expect(result.text).toContain('class StripePayment implements IPayment {')
    expect(result.text).toContain('/* Skeletonized')
    expect(result.text).not.toContain('const fee')
    expect(result.skeletonizedCount).toBe(1)
  })

  it('replaces function body with stub', () => {
    const source = `function calculateFee(amount: number): number {
  const fee = amount * 0.03
  return fee
}`
    const result = skeletonizeCode(source, [{ name: 'calculateFee', line: 1 }])
    expect(result.text).toContain('function calculateFee(amount: number): number {')
    expect(result.text).toContain('/* Skeletonized')
    expect(result.text).not.toContain('const fee')
  })

  it('skeletonizes multiple symbols in the same source', () => {
    const source = `class StripePayment implements IPayment {
  process(): void {}
}
// comment
class PayPalPayment implements IPayment {
  process(): void {}
}`
    const result = skeletonizeCode(source, [{ name: 'PayPalPayment', line: 5 }])
    expect(result.text).toContain('class StripePayment implements IPayment {')
    expect(result.text).toContain('class PayPalPayment implements IPayment {')

    expect(result.skeletonizedCount).toBe(1)
  })

  it('handles multiple skeletonizations in same source', () => {
    const source = `class A {
  a() {}
}
class B {
  b() {}
}
class C {
  c() {}
}`
    const result = skeletonizeCode(source, [
      { name: 'B', line: 4 },
      { name: 'C', line: 7 },
    ])
    expect(result.skeletonizedCount).toBe(2)
    expect(result.text).toContain('class A {')
    expect(result.text).not.toContain('b() {}')
    expect(result.text).not.toContain('c() {}')
  })

  it('skips symbols not found in source', () => {
    const source = 'class Foo { bar() {} }'
    const result = skeletonizeCode(source, [{ name: 'NonExistent', line: 1 }])
    expect(result.skeletonizedCount).toBe(0)
    expect(result.text).toBe(source)
  })

  it('handles nested braces correctly', () => {
    const source = `class Outer {
  inner() {
    if (true) {
      while (false) {
        // deep
      }
    }
  }
}`
    const result = skeletonizeCode(source, [{ name: 'Outer', line: 1 }])
    expect(result.text).toContain('class Outer {')
    expect(result.text).toContain('/* Skeletonized')
    expect(result.text).not.toContain('inner()')
    expect(result.text).not.toContain('while')
  })

  it('handles braces inside strings', () => {
    const source = `class Parser {
  parse() {
    const str = "hello { world }"
    const obj = { a: 1 }
  }
}`
    const result = skeletonizeCode(source, [{ name: 'Parser', line: 1 }])
    expect(result.text).toContain('class Parser {')
    expect(result.text).toContain('/* Skeletonized')
  })

  it('handles braces inside template literals', () => {
    const source = 'class Logger {\n  log() {\n    const msg = `hello ${name}`\n  }\n}'
    const result = skeletonizeCode(source, [{ name: 'Logger', line: 1 }])
    expect(result.text).toContain('class Logger {')
    expect(result.text).toContain('/* Skeletonized')
  })

  it('handles braces inside single-line comments', () => {
    const source = `class Config {
  load() {
    // this { has } braces
    const x = 1
  }
}`
    const result = skeletonizeCode(source, [{ name: 'Config', line: 1 }])
    expect(result.text).toContain('class Config {')
    expect(result.text).toContain('/* Skeletonized')
  })

  it('handles braces inside multi-line comments', () => {
    const source = `class Config {
  load() {
    /* multi { line { comment } } */
    const x = 1
  }
}`
    const result = skeletonizeCode(source, [{ name: 'Config', line: 1 }])
    expect(result.text).toContain('class Config {')
    expect(result.text).toContain('/* Skeletonized')
  })

  it('returns source unchanged for empty symbols array', () => {
    const source = 'class Foo { bar() {} }'
    const result = skeletonizeCode(source, [])
    expect(result.text).toBe(source)
    expect(result.skeletonizedCount).toBe(0)
  })

  it('handles one-liner class', () => {
    const source = 'class Foo { bar() { return 1 } }'
    const result = skeletonizeCode(source, [{ name: 'Foo', line: 1 }])
    expect(result.skeletonizedCount).toBe(1)
    expect(result.text).toContain('/* Skeletonized')
  })
})

describe('buildSkeletonizePlan', () => {
  it('creates plan for off-spine siblings only', () => {
    const polymorphicSupertypes = [
      {
        superId: 's1',
        superName: 'IPayment',
        superKind: 'interface',
        superFile: 'src/payment.ts',
        implementations: [
          { id: 'i1', name: 'StripePayment', kind: 'class', file: 'src/stripe.ts', relationType: 'implements' },
          { id: 'i2', name: 'PayPalPayment', kind: 'class', file: 'src/paypal.ts', relationType: 'implements' },
          { id: 'i3', name: 'CryptoPayment', kind: 'class', file: 'src/crypto.ts', relationType: 'implements' },
        ],
        implementationCount: 3,
      },
    ]

    const plan = buildSkeletonizePlan(polymorphicSupertypes)
    // StripePayment (first alphabetically) is spine — others get skeletonized
    expect(plan.spine).toBe('CryptoPayment')
    expect(plan.skeletonize.map((s) => s.name).sort()).toEqual(['PayPalPayment', 'StripePayment'])
  })

  it('allows custom spine selector', () => {
    const polymorphicSupertypes = [
      {
        superId: 's1',
        superName: 'IPayment',
        superKind: 'interface',
        superFile: 'src/payment.ts',
        implementations: [
          { id: 'i1', name: 'StripePayment', kind: 'class', file: 'src/stripe.ts', relationType: 'implements' },
          { id: 'i2', name: 'PayPalPayment', kind: 'class', file: 'src/paypal.ts', relationType: 'implements' },
          { id: 'i3', name: 'CryptoPayment', kind: 'class', file: 'src/crypto.ts', relationType: 'implements' },
        ],
        implementationCount: 3,
      },
    ]

    const plan = buildSkeletonizePlan(polymorphicSupertypes, { preferredSpine: 'PayPalPayment' })
    expect(plan.spine).toBe('PayPalPayment')
    expect(plan.skeletonize.map((s) => s.name).sort()).toEqual(['CryptoPayment', 'StripePayment'])
  })

  it('returns empty plan for no polymorphic groups', () => {
    const plan = buildSkeletonizePlan([])
    expect(plan.spine).toBeNull()
    expect(plan.skeletonize).toEqual([])
  })

  it('returns empty plan for groups with only 2 implementations', () => {
    const polymorphicSupertypes = [
      {
        superId: 's1',
        superName: 'IHandler',
        superKind: 'interface',
        superFile: 'src/handler.ts',
        implementations: [
          { id: 'i1', name: 'AHandler', kind: 'class', file: 'src/a.ts', relationType: 'implements' },
          { id: 'i2', name: 'BHandler', kind: 'class', file: 'src/b.ts', relationType: 'implements' },
        ],
        implementationCount: 2,
      },
    ]

    const plan = buildSkeletonizePlan(polymorphicSupertypes)
    expect(plan.skeletonize).toEqual([])
  })
})

describe('buildSkeletonizeReport', () => {
  it('returns empty report when the code graph has no polymorphic supertypes', () => {
    const store = createCodeStore()
    const report = buildSkeletonizeReport(store, PROJECT_ID)
    expect(report).toEqual([])
  })

  it('builds a skeletonize plan per detected polymorphic supertype', () => {
    const store = createCodeStore()
    insertSymbols(store, [
      { id: 'sym_iface', name: 'IPayment', kind: 'interface', file: 'src/payment.ts' },
      { id: 'sym_impl1', name: 'StripePayment', kind: 'class', file: 'src/stripe.ts' },
      { id: 'sym_impl2', name: 'PayPalPayment', kind: 'class', file: 'src/paypal.ts' },
      { id: 'sym_impl3', name: 'CryptoPayment', kind: 'class', file: 'src/crypto.ts' },
    ])
    insertRelations(store, [
      { id: 'rel1', fromSymbol: 'sym_impl1', toSymbol: 'sym_iface', type: 'implements' },
      { id: 'rel2', fromSymbol: 'sym_impl2', toSymbol: 'sym_iface', type: 'implements' },
      { id: 'rel3', fromSymbol: 'sym_impl3', toSymbol: 'sym_iface', type: 'implements' },
    ])

    const report = buildSkeletonizeReport(store, PROJECT_ID)
    expect(report).toHaveLength(1)
    expect(report[0].superName).toBe('IPayment')
    expect(report[0].superFile).toBe('src/payment.ts')
    expect(report[0].implementationCount).toBe(3)
    // CryptoPayment sorts first alphabetically → spine; the rest are skeletonized.
    expect(report[0].spine).toBe('CryptoPayment')
    expect(report[0].skeletonize.sort()).toEqual(['PayPalPayment', 'StripePayment'])
  })

  it('omits supertypes below the polymorphic threshold from the report', () => {
    const store = createCodeStore()
    insertSymbols(store, [
      { id: 'sym_iface', name: 'IHandler', kind: 'interface', file: 'src/handler.ts' },
      { id: 'sym_a', name: 'AHandler', kind: 'class', file: 'src/a.ts' },
      { id: 'sym_b', name: 'BHandler', kind: 'class', file: 'src/b.ts' },
    ])
    insertRelations(store, [
      { id: 'r1', fromSymbol: 'sym_a', toSymbol: 'sym_iface', type: 'implements' },
      { id: 'r2', fromSymbol: 'sym_b', toSymbol: 'sym_iface', type: 'implements' },
    ])

    const report = buildSkeletonizeReport(store, PROJECT_ID)
    expect(report).toEqual([])
  })
})
