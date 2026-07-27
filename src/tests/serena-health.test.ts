/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/integrations/serena-health.ts — checkSerenaHealth.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { checkSerenaHealth } from '../core/integrations/serena-health.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('checkSerenaHealth', () => {
  it('returns connected:false when the server is unreachable (never throws)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    const result = await checkSerenaHealth('http://127.0.0.1:9')
    expect(result.connected).toBe(false)
  })

  it('reports connected:true with version and tools on a healthy response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ version: '1.2.3', tools: ['find_symbol', 'list_dir'] }),
      }),
    )
    const result = await checkSerenaHealth('http://serena.test')
    expect(result.connected).toBe(true)
    expect(result.version).toBe('1.2.3')
    expect(result.exposedTools).toEqual(['find_symbol', 'list_dir'])
  })

  it('returns connected:false on a non-ok HTTP status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    const result = await checkSerenaHealth('http://serena.test')
    expect(result.connected).toBe(false)
  })
})
