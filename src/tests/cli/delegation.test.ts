/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { detectAgfLlm, buildDelegatedEnvelope } from '../../cli/shared/delegation.js'

describe('delegation — detectAgfLlm', () => {
  it('override.provider torna disponível', () => {
    const result = detectAgfLlm(undefined, {}, { provider: 'openai' })
    expect(result.available).toBe(true)
    expect(result.via).toBe('provider-setting')
  })

  it('ambiente sem provider e sem CLI retorna unavailable', () => {
    const env: NodeJS.ProcessEnv = {}
    const result = detectAgfLlm(undefined, env)
    expect(result.available).toBe(false)
  })

  it('sem override, sem env e sem store, retorna delegado', () => {
    const result = detectAgfLlm(undefined, {})
    expect(result.available).toBe(false)
  })
})

describe('delegation — buildDelegatedEnvelope (via ad-hoc sem store)', () => {
  it('retorna envelope delegado com prompt e nextSteps', async () => {
    const result = await buildDelegatedEnvelope({
      detected: { available: false, via: 'delegated-cli', detail: 'test' },
      adHocPrompt: 'Implemente a próxima task.',
    })
    expect(result.mode).toBe('delegated')
    expect(result.reason).toBeTruthy()
    expect(result.prompt).toBeTruthy()
    expect(Array.isArray(result.nextSteps)).toBe(true)
  })

  it('nextSteps é array de strings', async () => {
    const result = await buildDelegatedEnvelope({
      detected: { available: false, via: 'test' },
    })
    expect(result.nextSteps.length).toBeGreaterThan(0)
    expect(typeof result.nextSteps[0]).toBe('string')
  })

  it('usa fallback quando não há taskId nem store', async () => {
    const result = await buildDelegatedEnvelope({
      detected: { available: false, via: 'test' },
    })
    expect(result.mode).toBe('delegated')
    expect(result.task).toBeUndefined()
    expect(result.reason).toBeTruthy()
  })
})
