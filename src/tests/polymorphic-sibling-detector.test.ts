/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { CodeStore } from '../core/code/code-store.js'
import { detectPolymorphicSiblings } from '../core/analyzer/polymorphic-sibling-detector.js'

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

describe('detectPolymorphicSiblings', () => {
  it('returns empty when there are no extends/implements relations', () => {
    const store = createCodeStore()
    const result = detectPolymorphicSiblings(store, PROJECT_ID)
    expect(result).toEqual([])
  })

  it('returns empty when supertype has only 1 implementation', () => {
    const store = createCodeStore()
    insertSymbols(store, [
      { id: 'sym_iface', name: 'IPayment', kind: 'interface', file: 'src/payment.ts' },
      { id: 'sym_impl1', name: 'StripePayment', kind: 'class', file: 'src/stripe.ts' },
    ])
    insertRelations(store, [{ id: 'rel1', fromSymbol: 'sym_impl1', toSymbol: 'sym_iface', type: 'implements' }])
    const result = detectPolymorphicSiblings(store, PROJECT_ID)
    expect(result).toEqual([])
  })

  it('returns empty when supertype has only 2 implementations', () => {
    const store = createCodeStore()
    insertSymbols(store, [
      { id: 'sym_iface', name: 'IPayment', kind: 'interface', file: 'src/payment.ts' },
      { id: 'sym_impl1', name: 'StripePayment', kind: 'class', file: 'src/stripe.ts' },
      { id: 'sym_impl2', name: 'PayPalPayment', kind: 'class', file: 'src/paypal.ts' },
    ])
    insertRelations(store, [
      { id: 'rel1', fromSymbol: 'sym_impl1', toSymbol: 'sym_iface', type: 'implements' },
      { id: 'rel2', fromSymbol: 'sym_impl2', toSymbol: 'sym_iface', type: 'implements' },
    ])
    const result = detectPolymorphicSiblings(store, PROJECT_ID)
    expect(result).toEqual([])
  })

  it('detects interface with 3 implementations via implements', () => {
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
    const result = detectPolymorphicSiblings(store, PROJECT_ID)
    expect(result).toHaveLength(1)
    expect(result[0].superName).toBe('IPayment')
    expect(result[0].superKind).toBe('interface')
    expect(result[0].superFile).toBe('src/payment.ts')
    expect(result[0].implementationCount).toBe(3)
    expect(result[0].implementations.map((i) => i.name).sort()).toEqual([
      'CryptoPayment',
      'PayPalPayment',
      'StripePayment',
    ])
  })

  it('detects class with 3 subclasses via extends', () => {
    const store = createCodeStore()
    insertSymbols(store, [
      { id: 'sym_base', name: 'BasePlugin', kind: 'class', file: 'src/base.ts' },
      { id: 'sym_sub1', name: 'AuthPlugin', kind: 'class', file: 'src/auth.ts' },
      { id: 'sym_sub2', name: 'LogPlugin', kind: 'class', file: 'src/log.ts' },
      { id: 'sym_sub3', name: 'MetricsPlugin', kind: 'class', file: 'src/metrics.ts' },
    ])
    insertRelations(store, [
      { id: 'rel1', fromSymbol: 'sym_sub1', toSymbol: 'sym_base', type: 'extends' },
      { id: 'rel2', fromSymbol: 'sym_sub2', toSymbol: 'sym_base', type: 'extends' },
      { id: 'rel3', fromSymbol: 'sym_sub3', toSymbol: 'sym_base', type: 'extends' },
    ])
    const result = detectPolymorphicSiblings(store, PROJECT_ID)
    expect(result).toHaveLength(1)
    expect(result[0].superName).toBe('BasePlugin')
    expect(result[0].superKind).toBe('class')
    expect(result[0].implementationCount).toBe(3)
  })

  it('combines extends and implements for the same supertype', () => {
    const store = createCodeStore()
    insertSymbols(store, [
      { id: 'sym_base', name: 'BaseController', kind: 'class', file: 'src/base.ts' },
      { id: 'sym_sub1', name: 'UserController', kind: 'class', file: 'src/user.ts' },
      { id: 'sym_sub2', name: 'AdminController', kind: 'class', file: 'src/admin.ts' },
      { id: 'sym_sub3', name: 'GuestController', kind: 'class', file: 'src/guest.ts' },
    ])
    insertRelations(store, [
      { id: 'rel1', fromSymbol: 'sym_sub1', toSymbol: 'sym_base', type: 'extends' },
      { id: 'rel2', fromSymbol: 'sym_sub2', toSymbol: 'sym_base', type: 'extends' },
      { id: 'rel3', fromSymbol: 'sym_sub3', toSymbol: 'sym_base', type: 'implements' },
    ])
    const result = detectPolymorphicSiblings(store, PROJECT_ID)
    expect(result).toHaveLength(1)
    expect(result[0].superName).toBe('BaseController')
    expect(result[0].implementationCount).toBe(3)
  })

  it('detects multiple polymorphic supertypes in the same project', () => {
    const store = createCodeStore()
    insertSymbols(store, [
      { id: 'sym_iface', name: 'IPayment', kind: 'interface', file: 'src/payment.ts' },
      { id: 'sym_p1', name: 'Stripe', kind: 'class', file: 'src/stripe.ts' },
      { id: 'sym_p2', name: 'PayPal', kind: 'class', file: 'src/paypal.ts' },
      { id: 'sym_p3', name: 'Crypto', kind: 'class', file: 'src/crypto.ts' },
      { id: 'sym_base', name: 'BasePlugin', kind: 'class', file: 'src/base.ts' },
      { id: 'sym_b1', name: 'Auth', kind: 'class', file: 'src/auth.ts' },
      { id: 'sym_b2', name: 'Log', kind: 'class', file: 'src/log.ts' },
      { id: 'sym_b3', name: 'Metrics', kind: 'class', file: 'src/metrics.ts' },
    ])
    insertRelations(store, [
      { id: 'r1', fromSymbol: 'sym_p1', toSymbol: 'sym_iface', type: 'implements' },
      { id: 'r2', fromSymbol: 'sym_p2', toSymbol: 'sym_iface', type: 'implements' },
      { id: 'r3', fromSymbol: 'sym_p3', toSymbol: 'sym_iface', type: 'implements' },
      { id: 'r4', fromSymbol: 'sym_b1', toSymbol: 'sym_base', type: 'extends' },
      { id: 'r5', fromSymbol: 'sym_b2', toSymbol: 'sym_base', type: 'extends' },
      { id: 'r6', fromSymbol: 'sym_b3', toSymbol: 'sym_base', type: 'extends' },
    ])
    const result = detectPolymorphicSiblings(store, PROJECT_ID)
    expect(result).toHaveLength(2)
    const names = result.map((r) => r.superName).sort()
    expect(names).toEqual(['BasePlugin', 'IPayment'])
  })

  it('ignores non-extends/non-implements relations', () => {
    const store = createCodeStore()
    insertSymbols(store, [
      { id: 'sym_a', name: 'ClassA', kind: 'class', file: 'src/a.ts' },
      { id: 'sym_b', name: 'ClassB', kind: 'class', file: 'src/b.ts' },
      { id: 'sym_c', name: 'ClassC', kind: 'class', file: 'src/c.ts' },
      { id: 'sym_iface', name: 'ITarget', kind: 'interface', file: 'src/target.ts' },
    ])
    insertRelations(store, [
      { id: 'r1', fromSymbol: 'sym_a', toSymbol: 'sym_b', type: 'imports' },
      { id: 'r2', fromSymbol: 'sym_c', toSymbol: 'sym_a', type: 'calls' },
      { id: 'r3', fromSymbol: 'sym_b', toSymbol: 'sym_c', type: 'uses' },
    ])
    const result = detectPolymorphicSiblings(store, PROJECT_ID)
    expect(result).toEqual([])
  })

  it('includes file and kind in implementation details', () => {
    const store = createCodeStore()
    insertSymbols(store, [
      { id: 'sym_iface', name: 'IHandler', kind: 'interface', file: 'src/handler.ts' },
      { id: 'sym_a', name: 'HttpHandler', kind: 'class', file: 'src/http.ts' },
      { id: 'sym_b', name: 'WsHandler', kind: 'class', file: 'src/ws.ts' },
      { id: 'sym_c', name: 'GrpcHandler', kind: 'class', file: 'src/grpc.ts' },
      { id: 'sym_d', name: 'MockHandler', kind: 'class', file: 'tests/mock.ts' },
    ])
    insertRelations(store, [
      { id: 'r1', fromSymbol: 'sym_a', toSymbol: 'sym_iface', type: 'implements' },
      { id: 'r2', fromSymbol: 'sym_b', toSymbol: 'sym_iface', type: 'implements' },
      { id: 'r3', fromSymbol: 'sym_c', toSymbol: 'sym_iface', type: 'implements' },
      { id: 'r4', fromSymbol: 'sym_d', toSymbol: 'sym_iface', type: 'implements' },
    ])
    const result = detectPolymorphicSiblings(store, PROJECT_ID)
    expect(result).toHaveLength(1)
    expect(result[0].implementationCount).toBe(4)
    const implNames = result[0].implementations.map((i) => ({ name: i.name, file: i.file }))
    expect(implNames).toEqual(
      expect.arrayContaining([
        { name: 'HttpHandler', file: 'src/http.ts' },
        { name: 'WsHandler', file: 'src/ws.ts' },
        { name: 'GrpcHandler', file: 'src/grpc.ts' },
        { name: 'MockHandler', file: 'tests/mock.ts' },
      ]),
    )
  })
})
