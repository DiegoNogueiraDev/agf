/*!
 * TDD: provider status in FooterBar (node_082487bddc9a).
 *
 * AC1: Connected reachable provider → footer shows id with green dot.
 * AC2: Unreachable provider → footer shows error-color dot.
 */

import { describe, it, expect } from 'vitest'
import { formatProviderStatus } from '../tui/components/footer-provider-status.js'

describe('AC1: reachable provider shows green dot + id', () => {
  it('returns green dot + provider id when reachable', () => {
    const result = formatProviderStatus({ providerId: 'openai', reachable: true })
    expect(result.dot).toBe('●')
    expect(result.color).toBe('green')
    expect(result.label).toContain('openai')
  })
})

describe('AC2: unreachable provider shows error-color dot', () => {
  it('returns red dot when provider is unreachable', () => {
    const result = formatProviderStatus({ providerId: 'anthropic', reachable: false })
    expect(result.dot).toBe('●')
    expect(result.color).toBe('red')
    expect(result.label).toContain('anthropic')
  })

  it('returns gray dot when no provider configured', () => {
    const result = formatProviderStatus({ providerId: undefined, reachable: false })
    expect(result.color).toBe('gray')
  })
})
