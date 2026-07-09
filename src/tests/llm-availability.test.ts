/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * D1 — detecção de modo (autônomo vs delegado). Garante que o agf sabe quando
 * tem LLM próprio (provider/copilot) e quando precisa delegar p/ a CLI-agente.
 */
import { describe, it, expect } from 'vitest'
import { detectLlmAvailability } from '../core/model-hub/llm-availability.js'

const noLogin = (): boolean => false
const yesLogin = (): boolean => true

describe('detectLlmAvailability', () => {
  it('detecta provider via env key', () => {
    const r = detectLlmAvailability({ env: { OPENROUTER_API_KEY: 'sk-x' } as NodeJS.ProcessEnv, isLoggedInFn: noLogin })
    expect(r).toEqual({ available: true, via: 'provider-key', detail: 'openrouter' })
  })

  it('detecta provider+base-url persistidos (ollama local)', () => {
    const r = detectLlmAvailability({
      env: {} as NodeJS.ProcessEnv,
      providerSetting: 'ollama',
      providerBaseUrl: 'http://localhost:11434/v1',
      isLoggedInFn: noLogin,
    })
    expect(r).toEqual({ available: true, via: 'provider-setting', detail: 'ollama' })
  })

  it('detecta login Copilot', () => {
    const r = detectLlmAvailability({ env: {} as NodeJS.ProcessEnv, isLoggedInFn: yesLogin })
    expect(r).toEqual({ available: true, via: 'copilot-login', detail: 'copilot' })
  })

  it('sem provider, sem login → não disponível (modo delegado)', () => {
    const r = detectLlmAvailability({ env: {} as NodeJS.ProcessEnv, isLoggedInFn: noLogin })
    expect(r).toEqual({ available: false, via: 'none' })
  })

  it('env key tem prioridade sobre login', () => {
    const r = detectLlmAvailability({ env: { OPENAI_API_KEY: 'sk-x' } as NodeJS.ProcessEnv, isLoggedInFn: yesLogin })
    expect(r.via).toBe('provider-key')
  })
})
