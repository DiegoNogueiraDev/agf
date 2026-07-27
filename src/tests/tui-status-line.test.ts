/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_eabc05b02657 — formatStatusLine: linha de status compacta com tokens,
 * custo USD e modelo ativo. Inspirado em opencode session-context-usage.
 */
import { describe, it, expect } from 'vitest'
import { formatStatusLine } from '../tui/status-line.js'

describe('formatStatusLine — tokens/custo/modelo (#2c)', () => {
  it("inclui tokens, '$' do custo e o nome do modelo", () => {
    const line = formatStatusLine({ totalTokens: 1240, costUsd: 0.003, model: 'claude-sonnet-4.6' })
    expect(line).toContain('1240')
    expect(line).toContain('tok')
    expect(line).toContain('$0.0030')
    expect(line).toContain('claude-sonnet-4.6')
  })

  it("zero tokens → '0 tok' e '$0.0000' sem quebrar", () => {
    const line = formatStatusLine({ totalTokens: 0, costUsd: 0, model: 'auto' })
    expect(line).toContain('0 tok')
    expect(line).toContain('$0.0000')
    expect(line).toContain('auto')
  })

  it('custo é sempre exibido com 4 casas decimais', () => {
    expect(formatStatusLine({ totalTokens: 5, costUsd: 1.23456, model: 'm' })).toContain('$1.2346')
  })
})
