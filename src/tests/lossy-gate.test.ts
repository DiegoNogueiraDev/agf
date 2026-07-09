/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { applyLossyTransform } from '../core/economy/lossy-gate.js'

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
