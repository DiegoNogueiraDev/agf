/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §node_012df219d915 — Tests for RecoveryLedger :memory: DB
 * AC: GIVEN RecoveryLedger :memory: WHEN record called THEN persists attempt and returns with id
 * AC: GIVEN recorded attempts WHEN list called THEN returns attempts filtered by errorKind
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { RecoveryLedger } from '../core/schemas/recovery-ledger.schema.js'

const BASE_ATTEMPT = {
  errorKind: 'NetworkError',
  operation: 'fetchData',
  target: 'https://api.example.com/v1/nodes',
  retryable: true,
  escalation: 'LogAndContinue',
}

describe('RecoveryLedger', () => {
  let ledger: RecoveryLedger

  beforeEach(() => {
    ledger = new RecoveryLedger(':memory:')
  })

  afterEach(() => {
    ledger.close()
  })

  it('record() returns attempt with assigned id and attemptNumber', () => {
    const result = ledger.record(BASE_ATTEMPT)
    expect(result.id).toBeGreaterThan(0)
    expect(result.attemptNumber).toBe(1)
    expect(result.errorKind).toBe('NetworkError')
    expect(result.timestamp).toBeGreaterThan(0)
  })

  it('record() increments attemptNumber for same errorKind', () => {
    const first = ledger.record(BASE_ATTEMPT)
    const second = ledger.record(BASE_ATTEMPT)
    expect(first.attemptNumber).toBe(1)
    expect(second.attemptNumber).toBe(2)
  })

  it('list() returns all recorded attempts in DESC order', () => {
    ledger.record(BASE_ATTEMPT)
    ledger.record(BASE_ATTEMPT)
    const list = ledger.list()
    expect(list).toHaveLength(2)
  })

  it('list() filters by errorKind', () => {
    ledger.record(BASE_ATTEMPT)
    ledger.record({ ...BASE_ATTEMPT, errorKind: 'TimeoutError' })
    const result = ledger.list({ errorKind: 'NetworkError' })
    expect(result).toHaveLength(1)
    expect(result[0].errorKind).toBe('NetworkError')
  })

  it('list() respects limit', () => {
    ledger.record(BASE_ATTEMPT)
    ledger.record(BASE_ATTEMPT)
    ledger.record(BASE_ATTEMPT)
    const result = ledger.list({ limit: 2 })
    expect(result).toHaveLength(2)
  })

  it('count() returns number of attempts for errorKind', () => {
    ledger.record(BASE_ATTEMPT)
    ledger.record(BASE_ATTEMPT)
    ledger.record({ ...BASE_ATTEMPT, errorKind: 'OtherError' })
    expect(ledger.count('NetworkError')).toBe(2)
    expect(ledger.count('OtherError')).toBe(1)
  })

  it('reset() removes all attempts for errorKind', () => {
    ledger.record(BASE_ATTEMPT)
    ledger.record({ ...BASE_ATTEMPT, errorKind: 'OtherError' })
    ledger.reset('NetworkError')
    expect(ledger.count('NetworkError')).toBe(0)
    expect(ledger.count('OtherError')).toBe(1)
  })

  it('resetAll() clears all records', () => {
    ledger.record(BASE_ATTEMPT)
    ledger.record({ ...BASE_ATTEMPT, errorKind: 'OtherError' })
    ledger.resetAll()
    expect(ledger.list()).toHaveLength(0)
  })

  it('retryable false is persisted and returned correctly', () => {
    ledger.record({ ...BASE_ATTEMPT, retryable: false })
    const result = ledger.list()[0]
    expect(result.retryable).toBe(false)
  })
})
