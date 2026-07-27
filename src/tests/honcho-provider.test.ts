/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node_wire_b4a1f22798d8 — wire honcho-provider.ts to a surface.
 *
 * AC1: GIVEN HONCHO_API_URL is unset WHEN createHonchoProviderFromEnv runs
 *      THEN it returns undefined (default behavior unchanged)
 * AC2: GIVEN HONCHO_API_URL is set WHEN createHonchoProviderFromEnv runs
 *      THEN it returns a HonchoProvider configured with that URL and schema-valid defaults
 * AC3: GIVEN HONCHO_API_URL is set WHEN the returned provider prefetches
 *      THEN it fetches from the configured API URL
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { HonchoProvider, createHonchoProviderFromEnv } from '../core/memory/honcho-provider.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createHonchoProviderFromEnv', () => {
  it('returns undefined when HONCHO_API_URL is unset', () => {
    const provider = createHonchoProviderFromEnv({})
    expect(provider).toBeUndefined()
  })

  it('returns a configured HonchoProvider when HONCHO_API_URL is set', () => {
    const provider = createHonchoProviderFromEnv({ HONCHO_API_URL: 'http://honcho.test' })
    expect(provider).toBeInstanceOf(HonchoProvider)
    expect(provider!.name).toBe('honcho')
  })

  it('fetches from the configured API URL on prefetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ memories: [{ id: 'm1', content: 'hello' }] }),
      }),
    )
    const provider = createHonchoProviderFromEnv({ HONCHO_API_URL: 'http://honcho.test' })
    const results = await provider!.prefetch({ sessionId: 'sess1', recentMessages: [] })

    expect(fetch).toHaveBeenCalledWith('http://honcho.test/v1/memories', expect.anything())
    expect(results).toHaveLength(1)
    expect(results[0]!.id).toBe('honcho:m1')
  })
})
