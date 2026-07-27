/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 3.1 AC coverage: provider-ping.ts
 *
 * AC1: GIVEN valid API key WHEN ping THEN reachable=true, latencyMs >= 0
 * AC2: GIVEN invalid key WHEN ping THEN reachable=false, error='AUTH_ERROR'
 * AC3: GIVEN no network WHEN ping THEN reachable=false, error='TIMEOUT' after timeout
 * AC4: GIVEN --no-ping flag WHEN doctor --providers THEN skip ping, only envDetected
 * AC5: GIVEN multiple providers WHEN pingAllProviders THEN all run in parallel
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { pingProvider, pingAllProviders, type PingResult, type ProviderPingSpec } from '../core/doctor/provider-ping.js'
import { FiberSet } from '../core/autonomy/fiber-set.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSpec(provider: string, envVar: string): ProviderPingSpec {
  return { provider, envVar, endpoint: `https://api.${provider}.example/health` }
}

function mockFetch(status: number, body: unknown = {}): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: vi.fn().mockResolvedValue(body),
  })
}

function hangingFetch(): ReturnType<typeof vi.fn> {
  return vi.fn().mockReturnValue(new Promise(() => {})) // never resolves
}

// ── pingProvider ──────────────────────────────────────────────────────────────

describe('pingProvider', () => {
  describe('AC1: valid key → reachable=true', () => {
    it('returns reachable=true when fetch responds 200 (AC1)', async () => {
      const spec = makeSpec('anthropic', 'ANTHROPIC_API_KEY')
      const fetch = mockFetch(200)
      const result = await pingProvider(spec, 'sk-valid', 500, fetch)
      expect(result.reachable).toBe(true)
    })

    it('provider name matches spec (AC1)', async () => {
      const spec = makeSpec('anthropic', 'ANTHROPIC_API_KEY')
      const result = await pingProvider(spec, 'sk-valid', 500, mockFetch(200))
      expect(result.provider).toBe('anthropic')
    })

    it('envDetected=true when apiKey provided (AC1)', async () => {
      const spec = makeSpec('openai', 'OPENAI_API_KEY')
      const result = await pingProvider(spec, 'sk-proj-valid', 500, mockFetch(200))
      expect(result.envDetected).toBe(true)
    })

    it('latencyMs is a non-negative number (AC1)', async () => {
      const spec = makeSpec('anthropic', 'ANTHROPIC_API_KEY')
      const result = await pingProvider(spec, 'sk-valid', 500, mockFetch(200))
      expect(typeof result.latencyMs).toBe('number')
      expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    })

    it('no error field when reachable (AC1)', async () => {
      const spec = makeSpec('anthropic', 'ANTHROPIC_API_KEY')
      const result = await pingProvider(spec, 'sk-valid', 500, mockFetch(200))
      expect(result.error).toBeUndefined()
    })

    it('returns reachable=true for 201 status (AC1)', async () => {
      const spec = makeSpec('openai', 'OPENAI_API_KEY')
      const result = await pingProvider(spec, 'key', 500, mockFetch(201))
      expect(result.reachable).toBe(true)
    })
  })

  describe('AC2: invalid key → reachable=false, error=AUTH_ERROR', () => {
    it('returns reachable=false on 401 (AC2)', async () => {
      const spec = makeSpec('anthropic', 'ANTHROPIC_API_KEY')
      const result = await pingProvider(spec, 'invalid-key', 500, mockFetch(401))
      expect(result.reachable).toBe(false)
    })

    it('error is AUTH_ERROR on 401 (AC2)', async () => {
      const spec = makeSpec('anthropic', 'ANTHROPIC_API_KEY')
      const result = await pingProvider(spec, 'invalid-key', 500, mockFetch(401))
      expect(result.error).toBe('AUTH_ERROR')
    })

    it('returns reachable=false on 403 (AC2)', async () => {
      const spec = makeSpec('openai', 'OPENAI_API_KEY')
      const result = await pingProvider(spec, 'bad-key', 500, mockFetch(403))
      expect(result.reachable).toBe(false)
    })

    it('error is AUTH_ERROR on 403 (AC2)', async () => {
      const spec = makeSpec('openai', 'OPENAI_API_KEY')
      const result = await pingProvider(spec, 'bad-key', 500, mockFetch(403))
      expect(result.error).toBe('AUTH_ERROR')
    })

    it('envDetected=true even when auth fails (AC2)', async () => {
      const spec = makeSpec('anthropic', 'ANTHROPIC_API_KEY')
      const result = await pingProvider(spec, 'bad-key', 500, mockFetch(401))
      expect(result.envDetected).toBe(true)
    })
  })

  describe('AC3: timeout → reachable=false, error=TIMEOUT', () => {
    it('returns TIMEOUT error when fetch never resolves within timeout (AC3)', async () => {
      vi.useFakeTimers()
      const spec = makeSpec('anthropic', 'ANTHROPIC_API_KEY')
      const fetchHang = hangingFetch()
      const promise = pingProvider(spec, 'key', 100, fetchHang)
      vi.advanceTimersByTime(200)
      const result = await promise
      expect(result.reachable).toBe(false)
      expect(result.error).toBe('TIMEOUT')
      vi.useRealTimers()
    }, 3000)

    it('latencyMs is approximately the timeout value on TIMEOUT (AC3)', async () => {
      vi.useFakeTimers()
      const spec = makeSpec('anthropic', 'ANTHROPIC_API_KEY')
      const promise = pingProvider(spec, 'key', 200, hangingFetch())
      vi.advanceTimersByTime(300)
      const result = await promise
      expect(result.latencyMs).toBeGreaterThanOrEqual(190)
      vi.useRealTimers()
    }, 3000)

    it('TIMEOUT result has envDetected=true when key was provided (AC3)', async () => {
      vi.useFakeTimers()
      const spec = makeSpec('gemini', 'GEMINI_API_KEY')
      const promise = pingProvider(spec, 'some-key', 50, hangingFetch())
      vi.advanceTimersByTime(100)
      const result = await promise
      expect(result.envDetected).toBe(true)
      vi.useRealTimers()
    }, 3000)
  })

  describe('network error handling', () => {
    it('returns reachable=false when fetch throws a network error', async () => {
      const spec = makeSpec('anthropic', 'ANTHROPIC_API_KEY')
      const fetchErr = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
      const result = await pingProvider(spec, 'key', 500, fetchErr)
      expect(result.reachable).toBe(false)
    })

    it('error is NETWORK_ERROR when fetch throws (not auth/timeout)', async () => {
      const spec = makeSpec('anthropic', 'ANTHROPIC_API_KEY')
      const fetchErr = vi.fn().mockRejectedValue(new Error('network failure'))
      const result = await pingProvider(spec, 'key', 500, fetchErr)
      expect(result.error).toBe('NETWORK_ERROR')
    })
  })
})

// ── pingAllProviders ──────────────────────────────────────────────────────────

describe('pingAllProviders', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = mockFetch(200)
  })

  describe('AC4: --no-ping (noPing=true) → only envDetected, no reachability', () => {
    it('returns empty array when noPing=true (AC4: caller decides to skip)', async () => {
      const env = { ANTHROPIC_API_KEY: 'sk-valid' }
      const results = await pingAllProviders(env, { noPing: true, fetchFn: fetchMock })
      expect(results).toHaveLength(0)
    })

    it('does not call fetchFn when noPing=true (AC4)', async () => {
      const env = { ANTHROPIC_API_KEY: 'sk-valid' }
      await pingAllProviders(env, { noPing: true, fetchFn: fetchMock })
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('AC5: multiple providers verified in parallel', () => {
    it('pings only configured providers (AC5)', async () => {
      const env = { ANTHROPIC_API_KEY: 'sk-a', OPENAI_API_KEY: 'sk-b' }
      const results = await pingAllProviders(env, { fetchFn: fetchMock, timeout: 500 })
      expect(results.length).toBe(2)
    })

    it('returns empty when no providers configured (AC5)', async () => {
      const results = await pingAllProviders({}, { fetchFn: fetchMock, timeout: 500 })
      expect(results).toHaveLength(0)
    })

    it('each result has provider, envDetected, reachable, latencyMs (AC5)', async () => {
      const env = { ANTHROPIC_API_KEY: 'sk-a' }
      const results = await pingAllProviders(env, { fetchFn: fetchMock, timeout: 500 })
      expect(results).toHaveLength(1)
      const r = results[0]!
      expect(typeof r.provider).toBe('string')
      expect(typeof r.envDetected).toBe('boolean')
      expect(typeof r.reachable).toBe('boolean')
      expect(typeof r.latencyMs).toBe('number')
    })

    it('all fetch calls made in parallel (AC5): total time ≈ max(individual) not sum', async () => {
      let callCount = 0
      const delayedFetch = vi.fn().mockImplementation(() => {
        callCount++
        return new Promise<{ status: number; ok: boolean; json: () => Promise<unknown> }>((resolve) =>
          setTimeout(() => resolve({ status: 200, ok: true, json: async () => ({}) }), 50),
        )
      })
      const env = {
        ANTHROPIC_API_KEY: 'a',
        OPENAI_API_KEY: 'b',
        OPENROUTER_API_KEY: 'c',
      }
      const start = Date.now()
      await pingAllProviders(env, { fetchFn: delayedFetch, timeout: 500 })
      const elapsed = Date.now() - start
      expect(callCount).toBe(3)
      // If sequential, elapsed ≈ 150ms; if parallel ≈ 50ms. Threshold: < 120ms.
      expect(elapsed).toBeLessThan(120)
    })

    it('one provider auth error does not prevent others from succeeding (AC5)', async () => {
      let callCount = 0
      const mixedFetch = vi.fn().mockImplementation(() => {
        callCount++
        const status = callCount === 1 ? 401 : 200
        return Promise.resolve({ status, ok: status === 200, json: async () => ({}) })
      })
      const env = { ANTHROPIC_API_KEY: 'bad', OPENAI_API_KEY: 'good' }
      const results = await pingAllProviders(env, { fetchFn: mixedFetch, timeout: 500 })
      expect(results).toHaveLength(2)
      const reachable = results.filter((r) => r.reachable)
      const failed = results.filter((r) => !r.reachable)
      expect(reachable).toHaveLength(1)
      expect(failed).toHaveLength(1)
      expect(failed[0]!.error).toBe('AUTH_ERROR')
    })
  })

  describe('wiring: fan-out runs through FiberSet', () => {
    it('drives the concurrent fan-out via FiberSet.run/join', async () => {
      const runSpy = vi.spyOn(FiberSet.prototype, 'run')
      const joinSpy = vi.spyOn(FiberSet.prototype, 'join')
      const env = { ANTHROPIC_API_KEY: 'sk-a', OPENAI_API_KEY: 'sk-b' }
      const results = await pingAllProviders(env, { fetchFn: fetchMock, timeout: 500 })
      expect(runSpy).toHaveBeenCalledTimes(2)
      expect(joinSpy).toHaveBeenCalledTimes(1)
      expect(results).toHaveLength(2)
      runSpy.mockRestore()
      joinSpy.mockRestore()
    })
  })

  describe('result shape', () => {
    it('provider name is included in each result', async () => {
      const env = { ANTHROPIC_API_KEY: 'sk-a' }
      const results = await pingAllProviders(env, { fetchFn: fetchMock, timeout: 500 })
      expect(results[0]!.provider).toBe('anthropic')
    })

    it('envDetected=true for all configured providers', async () => {
      const env = { ANTHROPIC_API_KEY: 'sk-a', GEMINI_API_KEY: 'gm-k' }
      const results = await pingAllProviders(env, { fetchFn: fetchMock, timeout: 500 })
      expect(results.every((r) => r.envDetected === true)).toBe(true)
    })
  })
})
