/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { buildLiveRunResultWithCascade, type CascadeProvider } from '../tui/live-run-result-cascade.js'

function provider(name: string, impl: (prompt: string) => Promise<string>): CascadeProvider {
  return { name, implement: impl }
}

describe('buildLiveRunResultWithCascade', () => {
  it("returns the first provider's result when it succeeds", async () => {
    const providers = [provider('anthropic', async (p) => `ok:${p}`)]
    const result = await buildLiveRunResultWithCascade(providers, 'do X')
    expect(result).toEqual({ mode: 'live', summary: 'ok:do X', providerUsed: 'anthropic' })
  })

  it('falls through to the next provider when the first fails', async () => {
    const providers = [
      provider('anthropic', async () => {
        throw new Error('rate limited')
      }),
      provider('ollama', async (p) => `local:${p}`),
    ]
    const result = await buildLiveRunResultWithCascade(providers, 'do X')
    expect(result).toEqual({ mode: 'live', summary: 'local:do X', providerUsed: 'ollama' })
  })

  it('returns mode:delegated when every provider fails', async () => {
    const providers = [
      provider('a', async () => {
        throw new Error('fail a')
      }),
      provider('b', async () => {
        throw new Error('fail b')
      }),
    ]
    const result = await buildLiveRunResultWithCascade(providers, 'do X')
    expect(result.mode).toBe('delegated')
    expect(result.providerUsed).toBeUndefined()
    expect(result.summary).toContain('agf brief')
  })

  it('returns mode:delegated when no providers are configured', async () => {
    const result = await buildLiveRunResultWithCascade([], 'do X')
    expect(result.mode).toBe('delegated')
  })
})
