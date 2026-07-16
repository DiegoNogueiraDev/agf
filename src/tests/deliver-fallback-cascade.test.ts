/*!
 * TDD: deliver fallback cascade — cheaper/local before mode:delegated (node_fe6373d4f2e8).
 *
 * AC1: Given primary provider unavailable, When deliver runs,
 *      Then tries cheaper/local before returning mode:delegated.
 * AC2: Given no provider at all, When runs,
 *      Then returns mode:delegated (current behavior preserved as last resort).
 */

import { describe, it, expect, vi } from 'vitest'
import { buildLiveRunResultWithCascade, type CascadeProvider } from '../tui/live-run-result-cascade.js'

describe('AC1: tries cheaper/local before delegated', () => {
  it('falls back to second provider when first fails', async () => {
    const primary: CascadeProvider = { name: 'primary', implement: vi.fn().mockRejectedValue(new Error('unavailable')) }
    const cheaper: CascadeProvider = { name: 'cheaper', implement: vi.fn().mockResolvedValue('cheap response') }

    const result = await buildLiveRunResultWithCascade([primary, cheaper], 'test prompt')

    expect(result.mode).toBe('live')
    expect(result.summary).toBe('cheap response')
    expect(result.providerUsed).toBe('cheaper')
  })

  it('uses first available provider in cascade', async () => {
    const local: CascadeProvider = { name: 'local', implement: vi.fn().mockResolvedValue('local response') }
    const result = await buildLiveRunResultWithCascade([local], 'test prompt')

    expect(result.mode).toBe('live')
    expect(result.providerUsed).toBe('local')
  })
})

describe('AC2: no provider → mode:delegated preserved', () => {
  it('returns delegated when all providers fail', async () => {
    const p1: CascadeProvider = { name: 'p1', implement: vi.fn().mockRejectedValue(new Error('fail1')) }
    const p2: CascadeProvider = { name: 'p2', implement: vi.fn().mockRejectedValue(new Error('fail2')) }

    const result = await buildLiveRunResultWithCascade([p1, p2], 'test prompt')

    expect(result.mode).toBe('delegated')
    expect(result.summary).toContain('delegated')
  })

  it('returns delegated immediately when cascade is empty', async () => {
    const result = await buildLiveRunResultWithCascade([], 'test prompt')
    expect(result.mode).toBe('delegated')
  })
})
