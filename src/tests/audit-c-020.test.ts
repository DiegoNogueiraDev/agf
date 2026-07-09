/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * AUDIT-020 (CRIT) — CachingModelAdapter pre-hashes the key with fnv1a64, but
 * ResponseCache re-hashes it down to 32 bits (fnv1a32). Two distinct prompts can
 * collapse into the same 32-bit bucket and the cache would serve the wrong
 * prompt's cached answer with no verification. The adapter now stores the 64-bit
 * key hash alongside the value and verifies it on read.
 */

import { describe, it, expect } from 'vitest'
import { CachingModelAdapter } from '../core/model-hub/caching-model-adapter.js'
import { ResponseCache, createMemoryPersistence } from '../core/llm/response-cache.js'
import type { ModelAdapter, ModelRequest, ModelResponse } from '../core/model-hub/model-client.js'

/** Inner fake that counts calls and echoes a deterministic, per-call distinct text. */
function makeInner(): { adapter: ModelAdapter; calls: () => number } {
  let n = 0
  return {
    adapter: {
      generate: async (req: ModelRequest): Promise<ModelResponse> => ({
        text: `resp#${++n} for ${req.prompt}`,
        model: req.model,
        tokensIn: 100,
        tokensOut: 40,
      }),
    },
    calls: () => n,
  }
}

/**
 * Degenerate single-bucket cache: every key maps to the SAME slot. This models a
 * hash collision in the worst case — get() for ANY key returns whatever was last
 * set(). A safe adapter must NOT serve that entry for a different prompt.
 */
function collidingCache(): ResponseCache<ModelResponse> {
  let stored: ModelResponse | undefined
  const mock = {
    get: (_k: string): ModelResponse | undefined => stored,
    set: (_k: string, v: ModelResponse): unknown => {
      stored = v
      return v
    },
    size: (): number => (stored ? 1 : 0),
    invalidateAll: (): void => {
      stored = undefined
    },
  }
  return mock as unknown as ResponseCache<ModelResponse>
}

describe('AUDIT-020 — response cache verifies key identity on read', () => {
  it('does NOT serve another prompt’s answer on a (simulated) bucket collision', async () => {
    const inner = makeInner()
    const adapter = new CachingModelAdapter(inner.adapter, collidingCache(), { providerId: 'openrouter' })

    const a = await adapter.generate({ model: 'm', prompt: 'prompt A' })
    expect(a.fromCache).toBeFalsy()
    expect(inner.calls()).toBe(1)

    // Different prompt → different 64-bit key, but the colliding cache returns A's
    // stored entry. The adapter must detect the key mismatch and re-generate.
    const b = await adapter.generate({ model: 'm', prompt: 'prompt B' })
    expect(b.fromCache).toBeFalsy()
    expect(b.text).toContain('prompt B')
    expect(b.text).not.toBe(a.text)
    expect(inner.calls()).toBe(2)
  })

  it('still serves a genuine hit for the identical request (real cache)', async () => {
    const inner = makeInner()
    const cache = new ResponseCache<ModelResponse>({ schemaVersion: 1, persistence: createMemoryPersistence() })
    const adapter = new CachingModelAdapter(inner.adapter, cache, { providerId: 'openrouter' })
    const req: ModelRequest = { model: 'm', prompt: 'same' }

    const first = await adapter.generate(req)
    const second = await adapter.generate(req)

    expect(second.fromCache).toBe(true)
    expect(second.text).toBe(first.text)
    expect(inner.calls()).toBe(1)
    // The internal verification field must not leak to callers.
    expect((second as Record<string, unknown>).__agfKeyHash).toBeUndefined()
  })
})
