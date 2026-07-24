/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { selectProvider } from '../../core/model-hub/resolve-provider.js'

describe('selectProvider — não-regressão de provider', () => {
  it('openrouter + chave → openai-compatible (baseURL openrouter)', () => {
    const c = selectProvider('openrouter', { OPENROUTER_API_KEY: 'sk-test' })
    expect(c.kind).toBe('openai-compatible')
    if (c.kind === 'openai-compatible') {
      expect(c.providerId).toBe('openrouter')
      expect(c.baseURL).toContain('openrouter.ai')
    }
  })

  it('openrouter SEM chave → cai para copilot (não quebra)', () => {
    expect(selectProvider('openrouter', {}).kind).toBe('copilot')
  })

  it('sem setting → copilot (default)', () => {
    expect(selectProvider(null, { OPENROUTER_API_KEY: 'x' }).kind).toBe('copilot')
  })
})
