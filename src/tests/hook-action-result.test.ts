/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  HOOK_ACTIONS,
  HookActionSchema,
  HookActionResultSchema,
  HOOK_HANDLER_KINDS,
  allow,
  deny,
  modify,
  record,
  halt,
  isBlocking,
  isHalt,
  reduceHookResults,
  assertAsyncActionAllowed,
  AsyncHandlerActionError,
} from '../core/hooks/hook-types.js'

describe('HookAction model', () => {
  it('defines exactly the 5 actions allow|deny|modify|record|halt', () => {
    expect([...HOOK_ACTIONS].sort()).toEqual(['allow', 'deny', 'halt', 'modify', 'record'])
    expect(HookActionSchema.parse('halt')).toBe('halt')
    expect(() => HookActionSchema.parse('nope')).toThrow()
  })

  it('action constructors build well-formed results', () => {
    expect(allow()).toEqual({ action: 'allow' })
    expect(deny('blocked by policy')).toEqual({ action: 'deny', reason: 'blocked by policy' })
    expect(modify({ a: 1 })).toEqual({ action: 'modify', payload: { a: 1 } })
    expect(record()).toEqual({ action: 'record' })
    expect(halt('circuit open')).toEqual({ action: 'halt', reason: 'circuit open' })
  })

  it('validates results via schema', () => {
    expect(() => HookActionResultSchema.parse(deny('x'))).not.toThrow()
    expect(() => HookActionResultSchema.parse({ action: 'bogus' })).toThrow()
  })
})

describe('HookActionResult behavior — AC of Task 1.2', () => {
  it('deny short-circuits with a reason', () => {
    const folded = reduceHookResults([allow(), deny('not allowed'), modify({ a: 1 })])
    expect(folded.action).toBe('deny')
    expect(folded.reason).toBe('not allowed')
    expect(isBlocking(folded)).toBe(true)
  })

  it('modify mutates the payload before continuing', () => {
    const folded = reduceHookResults([allow(), modify({ a: 1 }), modify({ b: 2 })])
    expect(folded.action).toBe('modify')
    expect(folded.payload).toEqual({ a: 1, b: 2 })
    expect(isBlocking(folded)).toBe(false)
  })

  it('halt emergency-stops — wins over every other action', () => {
    const folded = reduceHookResults([deny('x'), modify({ a: 1 }), halt('stop now'), allow()])
    expect(folded.action).toBe('halt')
    expect(isHalt(folded)).toBe(true)
    expect(isBlocking(folded)).toBe(true)
  })

  it('record logs without interfering (allow-equivalent flow)', () => {
    const folded = reduceHookResults([record(), record()])
    expect(folded.action).toBe('record')
    expect(isBlocking(folded)).toBe(false)
    expect(folded.payload).toBeUndefined()
  })

  it('empty handler list folds to allow', () => {
    expect(reduceHookResults([]).action).toBe('allow')
  })
})

describe('sync/async handler split', () => {
  it('declares both handler kinds', () => {
    expect([...HOOK_HANDLER_KINDS].sort()).toEqual(['async', 'sync'])
  })

  it('async handlers may only record — non-record action throws a typed error', () => {
    expect(() => assertAsyncActionAllowed('async', record())).not.toThrow()
    expect(() => assertAsyncActionAllowed('async', deny('x'))).toThrow(AsyncHandlerActionError)
    expect(() => assertAsyncActionAllowed('async', halt('x'))).toThrow(AsyncHandlerActionError)
  })

  it('sync handlers may return any action', () => {
    for (const r of [allow(), deny('x'), modify({ a: 1 }), record(), halt('x')]) {
      expect(() => assertAsyncActionAllowed('sync', r)).not.toThrow()
    }
  })
})
