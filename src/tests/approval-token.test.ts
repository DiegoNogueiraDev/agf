import { describe, it, expect } from 'vitest'
import { ApprovalTokenLedger } from '../core/approval/approval-token.js'

function makeInput() {
  return {
    policy: 'bash-exec',
    action: 'rm -rf /tmp/work',
    grantedBy: 'orchestrator',
    grantedTo: 'executor',
  }
}

describe('ApprovalTokenLedger', () => {
  it('creates a token in pending status', () => {
    const ledger = new ApprovalTokenLedger()
    const token = ledger.create(makeInput())
    expect(token.status).toBe('pending')
    expect(token.policy).toBe('bash-exec')
    expect(token.id).toBeDefined()
  })

  it('grants a pending token', () => {
    const ledger = new ApprovalTokenLedger()
    const token = ledger.create(makeInput())
    const granted = ledger.grant(token.id)
    expect(granted?.status).toBe('granted')
  })

  it('cannot grant a non-existent token', () => {
    const ledger = new ApprovalTokenLedger()
    expect(ledger.grant('nonexistent')).toBeNull()
  })

  it('cannot grant an already-granted token again', () => {
    const ledger = new ApprovalTokenLedger()
    const token = ledger.create(makeInput())
    ledger.grant(token.id)
    expect(ledger.grant(token.id)).toBeNull()
  })

  it('consumes a granted token for the correct action', () => {
    const ledger = new ApprovalTokenLedger()
    const token = ledger.create(makeInput())
    ledger.grant(token.id)
    expect(ledger.consume(token.id, makeInput().action)).toBe(true)
  })

  it('cannot consume with wrong action', () => {
    const ledger = new ApprovalTokenLedger()
    const token = ledger.create(makeInput())
    ledger.grant(token.id)
    expect(ledger.consume(token.id, 'wrong-action')).toBe(false)
  })

  it('cannot consume a pending (non-granted) token', () => {
    const ledger = new ApprovalTokenLedger()
    const token = ledger.create(makeInput())
    expect(ledger.consume(token.id, makeInput().action)).toBe(false)
  })

  it('revokes any token regardless of status', () => {
    const ledger = new ApprovalTokenLedger()
    const token = ledger.create(makeInput())
    const revoked = ledger.revoke(token.id)
    expect(revoked?.status).toBe('revoked')
  })

  it('returns null when revoking non-existent token', () => {
    const ledger = new ApprovalTokenLedger()
    expect(ledger.revoke('ghost')).toBeNull()
  })

  it('verifies a granted token for the correct action', () => {
    const ledger = new ApprovalTokenLedger()
    const token = ledger.create(makeInput())
    ledger.grant(token.id)
    expect(ledger.verify(token.id, makeInput().action, {})).toBe(true)
  })

  it('verify returns false for wrong action', () => {
    const ledger = new ApprovalTokenLedger()
    const token = ledger.create(makeInput())
    ledger.grant(token.id)
    expect(ledger.verify(token.id, 'other-action', {})).toBe(false)
  })

  it('includes delegation chain', () => {
    const ledger = new ApprovalTokenLedger()
    const token = ledger.create(makeInput())
    expect(token.delegationChain).toContain('orchestrator→executor')
  })
})
