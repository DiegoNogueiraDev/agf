import { describe, it, expect } from 'vitest'
import { AxiomLinkSchema, propagateRevocation } from '../schemas/axiom-link.schema.js'

const valid = {
  id: 'link-001',
  constitutionPrincipleId: 'principle-42',
  acceptanceCriteriaIds: ['ac-1', 'ac-2'],
  provenanceReceiptId: 'receipt-xyz',
  timestamp: '2026-06-22T12:00:00Z',
}

describe('AxiomLinkSchema', () => {
  it('accepts a valid link', () => {
    expect(AxiomLinkSchema.safeParse(valid).success).toBe(true)
  })

  it('defaults revoked to false', () => {
    const result = AxiomLinkSchema.safeParse(valid)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.revoked).toBe(false)
  })

  it('rejects empty acceptanceCriteriaIds', () => {
    expect(AxiomLinkSchema.safeParse({ ...valid, acceptanceCriteriaIds: [] }).success).toBe(false)
  })

  it('rejects invalid timestamp format', () => {
    expect(AxiomLinkSchema.safeParse({ ...valid, timestamp: '2026-06-22' }).success).toBe(false)
  })
})

describe('propagateRevocation', () => {
  it('returns empty revokedAcIds when principle is not revoked', () => {
    const link = AxiomLinkSchema.parse(valid)
    const result = propagateRevocation(link, false)
    expect(result.revokedAcIds).toHaveLength(0)
    expect(result.link.revoked).toBe(false)
  })

  it('revokes link and propagates AC ids when principle is revoked', () => {
    const link = AxiomLinkSchema.parse(valid)
    const result = propagateRevocation(link, true)
    expect(result.link.revoked).toBe(true)
    expect(result.revokedAcIds).toEqual(['ac-1', 'ac-2'])
  })
})
