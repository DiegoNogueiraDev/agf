import { describe, it, expect } from 'vitest'
import { ApprovalTokenLedger } from '../../core/approval/approval-token.js'

describe('ApprovalTokenLedger', () => {
  it('creates token in Pending status', () => {
    const ledger = new ApprovalTokenLedger()
    const token = ledger.create({ policy: 'direct-push', action: 'push', grantedBy: 'owner', grantedTo: 'bot' })
    expect(token.status).toBe('pending')
    expect(token.id).toBeDefined()
  })

  it('grants token changes status to Granted', () => {
    const ledger = new ApprovalTokenLedger()
    const token = ledger.create({ policy: 'x', action: 'bash', grantedBy: 'admin', grantedTo: 'agent' })
    const granted = ledger.grant(token.id)
    expect(granted.status).toBe('granted')
  })

  it('consumes token and prevents reuse', () => {
    const ledger = new ApprovalTokenLedger()
    const token = ledger.create({ policy: 'x', action: 'deploy', grantedBy: 'owner', grantedTo: 'ci' })
    ledger.grant(token.id)
    const consumed = ledger.consume(token.id, 'deploy', {})
    expect(consumed).toBe(true)

    const reused = ledger.consume(token.id, 'deploy', {})
    expect(reused).toBe(false)
  })

  it('revoke changes status to Revoked', () => {
    const ledger = new ApprovalTokenLedger()
    const token = ledger.create({ policy: 'x', action: 'delete', grantedBy: 'admin', grantedTo: 'bot' })
    ledger.grant(token.id)
    const revoked = ledger.revoke(token.id)
    expect(revoked.status).toBe('revoked')
    expect(ledger.consume(token.id, 'delete', {})).toBe(false)
  })

  it('verify returns true for matching granted token', () => {
    const ledger = new ApprovalTokenLedger()
    const token = ledger.create({ policy: 'push', action: 'git push', grantedBy: 'lead', grantedTo: 'bot' })
    ledger.grant(token.id)
    expect(ledger.verify(token.id, 'git push', {})).toBe(true)
  })

  it('verify returns false for wrong action', () => {
    const ledger = new ApprovalTokenLedger()
    const token = ledger.create({ policy: 'push', action: 'git push', grantedBy: 'lead', grantedTo: 'bot' })
    ledger.grant(token.id)
    expect(ledger.verify(token.id, 'rm -rf', {})).toBe(false)
  })
})
