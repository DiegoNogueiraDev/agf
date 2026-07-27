import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import { RecoveryLedger, type RecoveryAttempt } from '../core/schemas/recovery-ledger.schema.js'

describe('RecoveryLedger', () => {
  let dbPath: string
  let ledger: RecoveryLedger

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'recovery-test-'))
    dbPath = join(dir, 'recovery.db')
    ledger = new RecoveryLedger(dbPath)
  })

  afterEach(() => {
    ledger.close()
    rmSync(dbPath, { recursive: true, force: true })
  })

  it('should record and retrieve attempts', () => {
    ledger.record({
      errorKind: 'LLM_TIMEOUT',
      operation: 'gateway.generate',
      target: 'haiku',
      retryable: true,
      escalation: 'LogAndContinue',
    })

    const all = ledger.list()
    expect(all).toHaveLength(1)
    expect(all[0]?.errorKind).toBe('LLM_TIMEOUT')
    expect(all[0]?.retryable).toBe(true)
    expect(all[0]?.escalation).toBe('LogAndContinue')
  })

  it('should increment attempt count per kind', { retry: 2 }, () => {
    for (let i = 0; i < 3; i++) {
      ledger.record({
        errorKind: 'DB_LOCKED',
        operation: 'store.query',
        target: 'graph.db',
        retryable: true,
        escalation: i < 2 ? 'LogAndContinue' : 'Escalate',
      })
    }

    const attempts = ledger.list({ errorKind: 'DB_LOCKED' })
    expect(attempts).toHaveLength(3)
    expect(attempts[0]?.attemptNumber).toBe(1)
    expect(attempts[2]?.attemptNumber).toBe(3)
  })

  it('should filter by error kind', () => {
    ledger.record({ errorKind: 'LLM_TIMEOUT', operation: 'a', target: 'x', retryable: true, escalation: 'Log' })
    ledger.record({ errorKind: 'DB_LOCKED', operation: 'b', target: 'y', retryable: true, escalation: 'Log' })

    const filtered = ledger.list({ errorKind: 'DB_LOCKED' })
    expect(filtered).toHaveLength(1)
  })

  it('should count attempts per kind', () => {
    ledger.record({ errorKind: 'LLM_TIMEOUT', operation: 'a', target: 'b', retryable: true, escalation: 'Log' })
    ledger.record({ errorKind: 'LLM_TIMEOUT', operation: 'a', target: 'b', retryable: true, escalation: 'Log' })

    expect(ledger.count('LLM_TIMEOUT')).toBe(2)
    expect(ledger.count('UNKNOWN')).toBe(0)
  })

  it('should reset by kind', () => {
    ledger.record({ errorKind: 'LLM_TIMEOUT', operation: 'a', target: 'b', retryable: true, escalation: 'Log' })
    ledger.record({ errorKind: 'DB_LOCKED', operation: 'c', target: 'd', retryable: true, escalation: 'Log' })

    ledger.reset('LLM_TIMEOUT')
    expect(ledger.count('LLM_TIMEOUT')).toBe(0)
    expect(ledger.count('DB_LOCKED')).toBe(1)
  })

  it('should reset all', () => {
    ledger.record({ errorKind: 'A', operation: 'a', target: 'x', retryable: true, escalation: 'Log' })
    ledger.record({ errorKind: 'B', operation: 'b', target: 'y', retryable: true, escalation: 'Log' })

    ledger.resetAll()
    expect(ledger.count('A')).toBe(0)
    expect(ledger.count('B')).toBe(0)
  })

  it('should include timestamps', () => {
    const before = Date.now()
    ledger.record({ errorKind: 'TEST', operation: 'op', target: 'tgt', retryable: true, escalation: 'Log' })
    const after = Date.now()

    const items = ledger.list()
    expect(items[0]?.timestamp).toBeGreaterThanOrEqual(before)
    expect(items[0]?.timestamp).toBeLessThanOrEqual(after)
  })

  it('should handle SQLite persistence across instances', () => {
    ledger.record({ errorKind: 'PERSIST', operation: 'test', target: 'demo', retryable: true, escalation: 'Log' })
    ledger.close()

    const ledger2 = new RecoveryLedger(dbPath)
    const items = ledger2.list()
    expect(items).toHaveLength(1)
    ledger2.close()
  })
})
