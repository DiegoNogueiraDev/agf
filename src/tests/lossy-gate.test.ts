/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { applyLossyTransform, measureDistortion } from '../core/economy/lossy-gate.js'

function nlStr(n = 600): string {
  return 'x'.repeat(n)
}

function codeStr(n = 2100): string {
  return 'x'.repeat(n)
}

describe('lossy-gate invariants (Part A)', () => {
  it('INV-2 no-grow: transform that does not shrink returns original', async () => {
    const orig = nlStr()
    const r = await applyLossyTransform({
      original: orig,
      transform: (s: string) => s + '!',
      kind: 'nl',
    })
    expect(r.outcome).toBe('reverted')
    expect(r.value).toBe(orig)
    expect(r.saved).toBe(0)
  })

  it('INV-2 no-grow: equal size is treated as no reduction', async () => {
    const orig = nlStr()
    const r = await applyLossyTransform({
      original: orig,
      transform: (s: string) => s.repeat(1),
      kind: 'nl',
    })
    expect(r.outcome).toBe('reverted')
    expect(r.saved).toBe(0)
  })

  it('INV-3 threshold: below minimum threshold passes through', async () => {
    const r = await applyLossyTransform({
      original: 'small',
      transform: (s: string) => s.slice(0, 2),
      kind: 'nl',
      thresholds: { nl: 50 },
    })
    expect(r.outcome).toBe('passthrough')
    expect(r.value).toBe('small')
  })

  it('INV-6 cap: blob larger than cap passes through', async () => {
    const big = 'x'.repeat(200)
    const r = await applyLossyTransform({
      original: big,
      transform: (s: string) => s.slice(0, 10),
      kind: 'nl',
      cap: 100,
    })
    expect(r.outcome).toBe('passthrough')
    expect(r.value).toBe(big)
  })

  it('parser absent → identity (no verify function, reduced)', async () => {
    const orig = codeStr()
    const r = await applyLossyTransform({
      original: orig,
      transform: (s: string) => s.slice(0, Math.floor(s.length / 2)),
      kind: 'code',
    })
    expect(r.outcome).toBe('accepted')
    expect(r.saved).toBeGreaterThan(0)
  })

  it('never throws: throwing transform returns reverted', async () => {
    const orig = nlStr()
    const r = await applyLossyTransform({
      original: orig,
      transform: () => {
        throw new Error('boom')
      },
      kind: 'nl',
    })
    expect(r.outcome).toBe('reverted')
    expect(r.value).toBe(orig)
  })

  it('accepts valid compression', async () => {
    const orig = nlStr()
    const r = await applyLossyTransform({
      original: orig,
      transform: (s: string) => s.slice(0, Math.floor(s.length / 2)),
      kind: 'nl',
    })
    expect(r.outcome).toBe('accepted')
    expect(r.saved).toBeGreaterThan(0)
  })

  it('override threshold via config allows tiny input to be processed', async () => {
    const r = await applyLossyTransform({
      original: 'tiny',
      transform: (s: string) => 't',
      kind: 'nl',
      thresholds: { nl: 0.5 },
    })
    expect(r.outcome).toBe('accepted')
  })

  it('verify function causes revert on semantic mismatch', async () => {
    const orig = codeStr()
    const r = await applyLossyTransform({
      original: orig,
      transform: (s: string) => 'wrong output',
      kind: 'code',
      verify: (_, cand) => Promise.resolve(cand.length >= orig.length * 0.5),
    })
    expect(r.outcome).toBe('reverted')
    expect(r.saved).toBe(0)
  })

  it('verify function passes when check succeeds', async () => {
    const orig = codeStr()
    const r = await applyLossyTransform({
      original: orig,
      transform: (s: string) => s.slice(0, Math.floor(s.length / 2)),
      kind: 'code',
      verify: (_, cand) => Promise.resolve(cand.length < orig.length),
    })
    expect(r.outcome).toBe('accepted')
    expect(r.saved).toBeGreaterThan(0)
  })

  describe('INV-4 preserve errors', () => {
    it('preserves stack traces in code', async () => {
      const orig = [
        '/* Error: fail at src/core.ts:42 */',
        'export function handler() {',
        '  try { throw new Error("fail") }',
        '  catch (e) { console.log("caught") }',
        '}',
      ].join('\n')
      const r = await applyLossyTransform({
        original: orig,
        transform: (s: string) => s.replace('throw new Error("fail")', 'throw new Error("err")'),
        kind: 'code',
        thresholds: { code: 1 },
      })
      expect(r.outcome).toBe('accepted')
    })

    it('reverts when stack trace content is dropped', async () => {
      const orig = ['/* Error: test failure at src/core/foo.ts:42 */', 'export function doStuff() {}'].join('\n')
      const r = await applyLossyTransform({
        original: orig,
        transform: () => 'export function doStuff() {}',
        kind: 'code',
        thresholds: { code: 1 },
      })
      expect(r.outcome).toBe('reverted')
      expect(r.value).toBe(orig)
    })

    it('preserves Error constructor references', async () => {
      const orig = [
        'export function validate(x: number) {',
        '  if (x < 0) throw new RangeError("negative")',
        '  return x;',
        '}',
      ].join('\n')
      const r = await applyLossyTransform({
        original: orig,
        transform: (s: string) => s.replace('"negative"', '"neg"').replace('return x;', ''),
        kind: 'code',
        thresholds: { code: 1 },
      })
      expect(r.outcome).toBe('accepted')
    })

    it('reverts if Error reference is removed', async () => {
      const orig =
        'export function validate(x: number) {\n  if (x < 0) throw new RangeError("negative")\n  return x;\n}'
      const r = await applyLossyTransform({
        original: orig,
        transform: () => 'export function validate() { return 0 }',
        kind: 'code',
        thresholds: { code: 1 },
      })
      expect(r.outcome).toBe('reverted')
    })

    it('preserves try/catch blocks', async () => {
      const orig = [
        'export function handler() {',
        '  try { doStuff() } catch (e) { log(e) }',
        '  return true',
        '}',
      ].join('\n')
      const r = await applyLossyTransform({
        original: orig,
        transform: (s: string) => s.replace('doStuff()', 'other()').replace('return true', ''),
        kind: 'code',
        thresholds: { code: 1 },
      })
      expect(r.outcome).toBe('accepted')
    })
  })

  it('verify function returning false causes revert even when shrunk', async () => {
    const orig = codeStr()
    const r = await applyLossyTransform({
      original: orig,
      transform: (s: string) => s.slice(0, Math.floor(s.length / 3)),
      kind: 'code',
      verify: () => Promise.resolve(false),
    })
    expect(r.outcome).toBe('reverted')
    expect(r.value).toBe(orig)
    expect(r.saved).toBe(0)
  })

  it('INV-5 code with export dropped by candidate causes revert (AST gate)', async () => {
    const orig = ['export function foo() { return 1 }', 'export function bar() { return 2 }'].join('\n')
    const r = await applyLossyTransform({
      original: orig,
      transform: () => 'export function foo() { return 1 }',
      kind: 'code',
      thresholds: { code: 1 },
    })
    expect(r.outcome).toBe('reverted')
    expect(r.value).toBe(orig)
    expect(r.saved).toBe(0)
  })

  it('INV-5 code with preserved exports is accepted (AST gate)', async () => {
    const orig = 'export function foo() { return 1 }\nconst unused = "hello world"'
    const r = await applyLossyTransform({
      original: orig,
      transform: (s: string) => 'export function foo() { return 1 }',
      kind: 'code',
      thresholds: { code: 1 },
    })
    expect(r.outcome).toBe('accepted')
    expect(r.saved).toBeGreaterThan(0)
  })
})

describe('bundle loss-safety guard — auto-revert to original (node_f46b61d0de8e)', () => {
  it('AC1: a meaning-breaking compression reverts to the ORIGINAL byte-for-byte (tokens_after == tokens_before)', async () => {
    const original = codeStr()
    const r = await applyLossyTransform({
      original,
      transform: () => 'corrupted', // shrinks a lot, but destroys the content
      kind: 'code',
      verify: () => Promise.resolve(false), // the semantic check fails → the gate MUST revert
    })
    expect(r.outcome).toBe('reverted')
    // The core safety property: no silent regression — the value is restored byte-for-byte.
    expect(r.value).toBe(original)
    // saved === 0 ⇔ tokens_after == tokens_before (nothing was actually cut).
    expect(r.saved).toBe(0)
  })

  it('AC2: a loss-safe compression is accepted with a real reduction (tokens_after < tokens_before)', async () => {
    const original = nlStr()
    const r = await applyLossyTransform({
      original,
      transform: (s: string) => s.slice(0, Math.floor(s.length / 2)),
      kind: 'nl',
      verify: (_, cand) => Promise.resolve(cand.length < original.length),
    })
    expect(r.outcome).toBe('accepted')
    // tokens_after < tokens_before: the accepted value is strictly smaller than the original.
    expect(r.value.length).toBeLessThan(original.length)
    expect(r.saved).toBeGreaterThan(0)
  })
})

describe('measureDistortion — metrica graduada de perda (E4.T1 node_ed4e8516b4c0)', () => {
  it('AC1: texto identico => distorcao 0', () => {
    const text = 'relatorio com 12345 e src/core/economy/lossy-gate.ts intactos'
    expect(measureDistortion(text, text)).toBe(0)
  })

  it('AC2: compressed vazio com original nao-vazio => distorcao 1', () => {
    expect(measureDistortion('conteudo real com 98765', '')).toBe(1)
  })

  it('AC3: remocao de 50% dos numeros e paths => distorcao entre 0.4 e 0.6 (proxy monotonica)', () => {
    // Arrange — 4 numeros + 4 paths, sem outras entidades
    const original = [
      'medida 11111 em src/alpha/beta.ts',
      'medida 22222 em src/gama/delta.ts',
      'medida 33333 em src/eps/zeta.ts',
      'medida 44444 em src/eta/theta.ts',
    ].join('\n')
    const compressed = ['medida 11111 em src/alpha/beta.ts', 'medida 22222 em src/gama/delta.ts'].join('\n')

    // Act
    const d = measureDistortion(original, compressed)

    // Assert
    expect(d).toBeGreaterThanOrEqual(0.4)
    expect(d).toBeLessThanOrEqual(0.6)
  })

  it('monotonia: remover mais entidades nunca reduz a distorcao', () => {
    const original = 'a 11111 b 22222 c 33333 d 44444'
    const keep3 = 'a 11111 b 22222 c 33333'
    const keep1 = 'a 11111'
    expect(measureDistortion(original, keep1)).toBeGreaterThan(measureDistortion(original, keep3))
  })

  it('texto sem entidades => 0 (ponto cego declarado da proxy — auditado pela rubrica)', () => {
    expect(measureDistortion('apenas prosa sem numeros nem caminhos', 'prosa')).toBe(0)
  })
})
