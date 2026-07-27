/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 1.4 AC coverage: failover, auth-refresh, tier-routing, caching
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FailoverModelAdapter } from '../../core/model-hub/failover-model-adapter.js'
import {
  getValidCopilotToken,
  saveAuth,
  type FetchLike,
  type FetchResponse,
} from '../../core/model-hub/copilot-auth.js'
import { chooseEffort } from '../../core/model-hub/effort-router.js'
import { routeModel, resolveTierModel, ANTHROPIC_FRONTIER_DEFAULT } from '../../core/model-hub/tier-router.js'
import { CachingModelAdapter, buildResponseCache } from '../../core/model-hub/caching-model-adapter.js'
import type { ModelAdapter, ModelRequest, ModelResponse } from '../../core/model-hub/model-client.js'

// ── Helpers ────────────────────────────────────────────────────────────────────

function adapter(text: string): ModelAdapter {
  return {
    generate: async (r: ModelRequest): Promise<ModelResponse> => ({
      text,
      model: r.model,
      tokensIn: 50,
      tokensOut: 20,
    }),
  }
}

function httpError(status: number, message: string): ModelAdapter {
  return {
    generate: async (): Promise<ModelResponse> => {
      const err = Object.assign(new Error(message), { status })
      throw err
    },
  }
}

function jsonResponse(body: unknown, status = 200): FetchResponse {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }
}

// ── AC1: provider 429 → failover to next in chain ─────────────────────────────

describe('AC1: FailoverModelAdapter — 429 triggers fallthrough to next provider', () => {
  it('primary 429 → secondary receives the request and returns its response', async () => {
    const fa = new FailoverModelAdapter([
      { providerId: 'primary', adapter: httpError(429, 'rate limited') },
      { providerId: 'secondary', adapter: adapter('fallback-response') },
    ])

    const result = await fa.generate({ model: 'gpt-5', prompt: 'hello' })

    expect(result.text).toBe('fallback-response')
    const status = fa.failoverStatus()
    expect(status.fallbackCount).toBe(1)
    expect(status.targets[0].failures).toBe(1)
    expect(status.targets[0].lastError).toContain('rate limited')
    expect(status.targets[1].failures).toBe(0)
  })

  it('single provider: 429 is re-thrown (no fallback available)', async () => {
    const fa = new FailoverModelAdapter([{ providerId: 'only', adapter: httpError(429, 'rate limited') }])

    await expect(fa.generate({ model: 'gpt-5', prompt: 'hello' })).rejects.toThrow('rate limited')
    expect(fa.failoverStatus().fallbackCount).toBe(0)
  })

  it('all providers 429 → last error propagates', async () => {
    const fa = new FailoverModelAdapter([
      { providerId: 'a', adapter: httpError(429, 'a limited') },
      { providerId: 'b', adapter: httpError(429, 'b limited') },
      { providerId: 'c', adapter: httpError(429, 'c limited') },
    ])

    await expect(fa.generate({ model: 'any', prompt: 'x' })).rejects.toThrow('c limited')
    expect(fa.failoverStatus().fallbackCount).toBe(0)
    expect(fa.failoverStatus().targets[0].failures).toBe(1)
  })
})

// ── AC2: expired Copilot token → auto-refresh before returning ─────────────────

describe('AC2: getValidCopilotToken — expired token triggers auto-refresh', () => {
  let dir: string
  let authFile: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-auth-1.4-'))
    authFile = join(dir, 'auth.json')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('expired copilotToken → exchangeForCopilotToken is called and fresh token returned', async () => {
    saveAuth(authFile, {
      githubToken: 'ghu_valid',
      copilotToken: 'old_expired_jwt',
      copilotExpiresAt: Date.now() - 1000, // 1s in the past — expired
    })

    let exchangeCalls = 0
    const fetchFn: FetchLike = async (): Promise<FetchResponse> => {
      exchangeCalls++
      return jsonResponse({
        token: 'fresh_copilot_jwt',
        expires_at: Math.floor((Date.now() + 30 * 60_000) / 1000), // 30 min ahead in seconds
        endpoints: { api: 'https://api.githubcopilot.com' },
      })
    }

    const result = await getValidCopilotToken({ fetchFn, authFilePath: authFile })

    expect(result.token).toBe('fresh_copilot_jwt')
    expect(exchangeCalls).toBe(1) // refresh was triggered exactly once
  })

  it('valid token within REFRESH_BUFFER → no exchange called', async () => {
    saveAuth(authFile, {
      githubToken: 'ghu_valid',
      copilotToken: 'still_valid_jwt',
      copilotExpiresAt: Date.now() + 10 * 60_000, // 10 min ahead — outside the 60s buffer
      apiBase: 'https://api.githubcopilot.com',
    })

    let exchangeCalls = 0
    const fetchFn: FetchLike = async (): Promise<FetchResponse> => {
      exchangeCalls++
      return jsonResponse({ token: 'SHOULD_NOT_BE_RETURNED', expires_at: 9999999999 })
    }

    const result = await getValidCopilotToken({ fetchFn, authFilePath: authFile })

    expect(result.token).toBe('still_valid_jwt')
    expect(exchangeCalls).toBe(0)
  })
})

// ── AC3: effort=high (plan kind) → tier-router returns frontier model ──────────

describe('AC3: effort=high (via plan kind) → frontier model from tier-router', () => {
  it('chooseEffort for plan kind returns high', () => {
    expect(chooseEffort({ kind: 'plan', attempt: 1 })).toBe('high')
  })

  it('routeModel auto + plan → frontier model (claude-opus-4-8)', () => {
    const model = routeModel({ mode: 'auto' }, 'plan')
    expect(model).toBe(ANTHROPIC_FRONTIER_DEFAULT) // 'claude-opus-4-8'
  })

  it('resolveTierModel frontier → claude-opus-4-8 (the Anthropic frontier default)', () => {
    const model = resolveTierModel('frontier')
    expect(model).toBe(ANTHROPIC_FRONTIER_DEFAULT)
  })

  it('implement (build tier) does NOT route to frontier', () => {
    const model = routeModel({ mode: 'auto' }, 'implement')
    expect(model).not.toBe(ANTHROPIC_FRONTIER_DEFAULT)
    // Build tier → Sonnet 4.6
    expect(model).toBe('claude-sonnet-4-6')
  })
})

// ── AC4: caching active → second request returns fromCache + savedTokens > 0 ──

describe('AC4: CachingModelAdapter — second identical request uses cached tokens', () => {
  it('second identical request returns fromCache:true and increments savedTokens', async () => {
    let callCount = 0
    const inner: ModelAdapter = {
      generate: async (r: ModelRequest): Promise<ModelResponse> => {
        callCount++
        return { text: `response #${callCount}`, model: r.model, tokensIn: 100, tokensOut: 40 }
      },
    }
    const cache = buildResponseCache() // memory-only (no db)
    const ca = new CachingModelAdapter(inner, cache, { providerId: 'openrouter', enabled: true })
    const req: ModelRequest = { model: 'claude-sonnet-4-6', prompt: 'implement feature X', effort: 'low' }

    const first = await ca.generate(req)
    expect(first.fromCache).toBeFalsy()
    expect(callCount).toBe(1)

    const second = await ca.generate(req)
    expect(second.fromCache).toBe(true)
    expect(second.text).toBe(first.text) // same response
    expect(callCount).toBe(1) // inner was NOT called again

    const stats = ca.asCacheRegistration()
    expect(stats.hits()).toBe(1)
    expect(stats.misses()).toBe(1)
    expect(stats.tokensSaved()).toBeGreaterThan(0) // tokensIn(100) + tokensOut(40) = 140 saved
    expect(stats.tokensSaved()).toBe(140)
  })

  it('different requests (distinct prompts) → separate cache entries, inner called twice', async () => {
    let callCount = 0
    const inner: ModelAdapter = {
      generate: async (r: ModelRequest): Promise<ModelResponse> => {
        callCount++
        return { text: `r${callCount}`, model: r.model, tokensIn: 10, tokensOut: 5 }
      },
    }
    const ca = new CachingModelAdapter(inner, buildResponseCache(), { enabled: true })

    await ca.generate({ model: 'm', prompt: 'prompt A' })
    await ca.generate({ model: 'm', prompt: 'prompt B' })

    expect(callCount).toBe(2)
    expect(ca.asCacheRegistration().hits()).toBe(0)
  })

  it('kill-switch disabled → never caches, inner always called', async () => {
    let callCount = 0
    const inner: ModelAdapter = {
      generate: async (): Promise<ModelResponse> =>
        ({ text: 'x', model: 'm', tokensIn: 10, tokensOut: 5, callCount: ++callCount }) as ModelResponse & {
          callCount: number
        },
    }
    const ca = new CachingModelAdapter(inner, buildResponseCache(), { enabled: false })
    const req: ModelRequest = { model: 'm', prompt: 'same prompt' }

    await ca.generate(req)
    const second = await ca.generate(req)

    expect(callCount).toBe(2)
    expect(second.fromCache).toBeFalsy()
  })
})
