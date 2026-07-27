/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_b91483eb8799 — navigateHistory: recall puro de histórico de comandos
 * com ↑/↓, preservando o rascunho não-submetido. Inspirado em
 * opencode prompt-input/history.ts.
 */
import { describe, it, expect } from 'vitest'
import { navigateHistory, redactHistoryEntry, type HistoryState } from '../tui/history.js'

describe('navigateHistory — recall com ↑/↓ (#2b)', () => {
  const base: HistoryState = { history: ['a', 'b', 'c'], cursor: -1, draft: '' }

  it("↑ a partir do rascunho retorna o mais recente ('c'); ↑ de novo retorna 'b'", () => {
    const first = navigateHistory(base, 'up')
    expect(first.value).toBe('c')
    expect(first.cursor).toBe(0)

    const second = navigateHistory({ ...base, cursor: first.cursor }, 'up')
    expect(second.value).toBe('b')
    expect(second.cursor).toBe(1)
  })

  it('no fim do histórico, ↓ restaura o rascunho não-submetido', () => {
    const state: HistoryState = { history: ['a', 'b', 'c'], cursor: 0, draft: 'rascunho parcial' }
    const result = navigateHistory(state, 'down')
    expect(result.value).toBe('rascunho parcial')
    expect(result.cursor).toBe(-1)
  })

  it('↑ no item mais antigo permanece nele (clamp)', () => {
    const state: HistoryState = { history: ['a', 'b', 'c'], cursor: 2, draft: '' }
    const result = navigateHistory(state, 'up')
    expect(result.value).toBe('a')
    expect(result.cursor).toBe(2)
  })

  it('↓ no rascunho permanece no rascunho', () => {
    const result = navigateHistory({ ...base, draft: 'x' }, 'down')
    expect(result.value).toBe('x')
    expect(result.cursor).toBe(-1)
  })

  it('histórico vazio → sempre o rascunho', () => {
    const state: HistoryState = { history: [], cursor: -1, draft: 'y' }
    expect(navigateHistory(state, 'up').value).toBe('y')
    expect(navigateHistory(state, 'up').cursor).toBe(-1)
  })
})

describe('node_fa04547ae3fa: redactHistoryEntry strips API keys before persisting to disk', () => {
  it('redacts the key from "/provider connect <id> <key>"', () => {
    const result = redactHistoryEntry('/provider connect openai sk-proj-abc123XYZsecret')
    expect(result).toBe('/provider connect openai [REDACTED]')
    expect(result).not.toContain('sk-proj-abc123XYZsecret')
  })

  it('redacts a multi-word/spaced key the same way', () => {
    const result = redactHistoryEntry('/provider connect anthropic sk ant part2')
    expect(result).toBe('/provider connect anthropic [REDACTED]')
  })

  it('leaves "/provider connect <id>" with no key untouched', () => {
    const result = redactHistoryEntry('/provider connect ollama')
    expect(result).toBe('/provider connect ollama')
  })

  it('leaves unrelated commands untouched', () => {
    expect(redactHistoryEntry('/provider use openai')).toBe('/provider use openai')
    expect(redactHistoryEntry('/provider list')).toBe('/provider list')
    expect(redactHistoryEntry('agf stats')).toBe('agf stats')
  })

  it('is case-insensitive on the subcommand and tolerates extra whitespace', () => {
    const result = redactHistoryEntry('/provider  CONNECT  openai   sk-secret')
    expect(result).toBe('/provider  CONNECT  openai   [REDACTED]')
  })
})
