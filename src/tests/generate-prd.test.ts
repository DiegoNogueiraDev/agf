/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_d68504f3f697 — generate-prd: prompt puro de geração de PRD + geração
 * por injeção (fake nos testes = 0 token de LLM).
 */
import { describe, it, expect } from 'vitest'
import { buildPrdPrompt, buildSlotPrdPrompt, generatePrd } from '../core/prd/generate-prd.js'
import { ValidationError } from '../core/utils/errors.js'

describe('buildPrdPrompt — template com seções obrigatórias (#O3)', () => {
  it('inclui as seções de Requisitos, Critérios de Aceitação, Constraints e Riscos', () => {
    const p = buildPrdPrompt('um kanban de tarefas')
    expect(p).toContain('um kanban de tarefas')
    expect(p).toMatch(/[EÉ]picos|Requisitos/i)
    // Per-task AC section: may be "Acceptance Criteria" or "Critérios de Aceitação"
    expect(p).toMatch(/acceptance\s+criteria|crit[eé]rios?\s+de\s+aceita[cç]/i)
    expect(p).toMatch(/Constraints|Restri[çc][õo]es/i)
    expect(p).toMatch(/Riscos/i)
  })
})

describe('generatePrd — geração por injeção (#O3)', () => {
  it('retorna o markdown do PRD produzido pelo generate', async () => {
    const fakePrd = '# PRD\n## Requisitos\n- R1'
    const md = await generatePrd('kanban', { generate: async () => fakePrd })
    expect(md).toBe(fakePrd)
  })

  it('passa o prompt (com a descrição) ao generate', async () => {
    let seenPrompt = ''
    await generatePrd('meu produto X', {
      generate: async (prompt) => {
        seenPrompt = prompt
        return '# PRD'
      },
    })
    expect(seenPrompt).toContain('meu produto X')
  })

  it('descrição vazia → ValidationError (não gera lixo)', async () => {
    await expect(generatePrd('   ', { generate: async () => 'x' })).rejects.toBeInstanceOf(ValidationError)
  })

  it('sem 3º argumento, o prompt é byte-idêntico ao buildPrdPrompt de hoje (node_13eee4a174e2)', async () => {
    let seenPrompt = ''
    await generatePrd('meu produto X', {
      generate: async (prompt) => {
        seenPrompt = prompt
        return '# PRD'
      },
    })
    expect(seenPrompt).toBe(buildPrdPrompt('meu produto X'))
  })

  it('com scaffold.slots preenchido, o prompt contém os slots e não o template completo (node_13eee4a174e2)', async () => {
    let seenPrompt = ''
    await generatePrd(
      'meu produto X',
      {
        generate: async (prompt) => {
          seenPrompt = prompt
          return '# PRD'
        },
      },
      { slots: ['nome', 'problema'] },
    )
    expect(seenPrompt).toContain('nome')
    expect(seenPrompt).toContain('problema')
    expect(seenPrompt).not.toContain('Estruture com EXATAMENTE estas seções')
  })

  it('scaffold.slots vazio cai de volta para o prompt completo (node_13eee4a174e2)', async () => {
    let seenPrompt = ''
    await generatePrd(
      'meu produto X',
      {
        generate: async (prompt) => {
          seenPrompt = prompt
          return '# PRD'
        },
      },
      { slots: [] },
    )
    expect(seenPrompt).toBe(buildPrdPrompt('meu produto X'))
  })
})

describe('buildSlotPrdPrompt — prompt reduzido a partir de um scaffold recuperado (node_13eee4a174e2)', () => {
  it('inclui a descrição e cada slot, e instrui o modelo a tratar os slots como piso', () => {
    const p = buildSlotPrdPrompt('um kanban de tarefas', ['nome', 'problema', 'fases[]'])
    expect(p).toContain('um kanban de tarefas')
    expect(p).toContain('nome')
    expect(p).toContain('problema')
    expect(p).toContain('fases[]')
    expect(p).not.toContain('Estruture com EXATAMENTE estas seções')
    // Risco (node_7eb68f1b471d): slots são piso, não teto — o prompt deve dizer isso.
    expect(p).toMatch(/al[ée]m d(estes|os) slots|se o produto (precisar|exigir)/i)
  })
})
