import { randomUUID } from 'node:crypto'

export type TokenStatus = 'pending' | 'granted' | 'consumed' | 'expired' | 'revoked'

export interface TokenInput {
  policy: string
  action: string
  grantedBy: string
  grantedTo: string
  scope?: Record<string, string>
}

export interface ApprovalToken {
  id: string
  policy: string
  action: string
  grantedBy: string
  grantedTo: string
  scope?: Record<string, string>
  status: TokenStatus
  delegationChain: string[]
  createdAt: string
}

export class ApprovalTokenLedger {
  private tokens = new Map<string, ApprovalToken>()

  create(input: TokenInput): ApprovalToken {
    const token: ApprovalToken = {
      id: randomUUID().slice(0, 8),
      policy: input.policy,
      action: input.action,
      grantedBy: input.grantedBy,
      grantedTo: input.grantedTo,
      scope: input.scope,
      status: 'pending',
      delegationChain: [`${input.grantedBy}→${input.grantedTo}`],
      createdAt: new Date().toISOString(),
    }
    this.tokens.set(token.id, token)
    return token
  }

  grant(id: string): ApprovalToken | null {
    const token = this.tokens.get(id)
    if (!token || token.status !== 'pending') return null
    token.status = 'granted'
    return token
  }

  consume(id: string, action: string, _scope?: Record<string, string>): boolean {
    const token = this.tokens.get(id)
    if (!token || token.status !== 'granted') return false
    if (token.action !== action) return false
    token.status = 'consumed'
    return true
  }

  revoke(id: string): ApprovalToken | null {
    const token = this.tokens.get(id)
    if (!token) return null
    token.status = 'revoked'
    return token
  }

  verify(id: string, action: string, _scope: Record<string, unknown>): boolean {
    const token = this.tokens.get(id)
    if (!token || token.status !== 'granted') return false
    if (token.action !== action) return false
    return true
  }
}
