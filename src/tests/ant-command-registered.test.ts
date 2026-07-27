/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node_331ab8461b9d — `agf ant` funciona (commands-list) mas era INVISÍVEL: faltava
 * no COMMAND_REGISTRY (fora do índice do `agf help`) e a descrição de `ant spawn`
 * não casava a consulta natural "spawnar formigas" no retrieve. Descoberta = matar
 * a dormência (regra 9).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { COMMAND_REGISTRY } from '../core/config/command-registry.js'
import { buildLiveCorpus } from '../core/rag-in/builtin-corpus.js'
import { retrieveCommand } from '../core/rag-in/retrieve.js'

describe('descoberta do agf ant', () => {
  it('AC1: COMMAND_REGISTRY contém `ant` (alimenta agf usage + o bloco gerado de CLAUDE.md)', () => {
    expect(COMMAND_REGISTRY.some((c) => c.name === 'ant' && !c.parent)).toBe(true)
    // subcomando spawn ancorado no pai ant
    expect(COMMAND_REGISTRY.some((c) => c.name === 'spawn' && c.parent === 'ant')).toBe(true)
  })

  it('AC1: o índice curado de `agf help` (help-cmd.ts) lista `ant spawn`', () => {
    // agf help é curado (não vem do registry) — o ant precisa estar lá também.
    const helpSrc = readFileSync('src/cli/commands/help-cmd.ts', 'utf8')
    expect(helpSrc).toMatch(/ant spawn/)
  })

  it('AC2: retrieveCommand("spawnar formigas") resolve para ant no gate real do CLI (threshold 0.5)', () => {
    const corpus = buildLiveCorpus([])
    // O `agf retrieve-command` usa threshold 0.5 por default — abaixo dele vira
    // fallback_help (command null). Reproduz a behavior real, não a permissiva.
    const decision = retrieveCommand('spawnar formigas', corpus, { threshold: 0.5 })
    expect(decision.decision).not.toBe('fallback_help')
    expect(decision.top?.command ?? '').toMatch(/\bant\b/)
  })
})
