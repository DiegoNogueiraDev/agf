/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_6449e6b57857 — os três scaffolders de autoria, descobríveis de um ponto.
 *
 * "Qualquer pessoa opera" inclui AUTORAR: criar uma skill, um agente, um hook.
 * Hoje os três comandos existem e nenhum aparece no índice — quem não leu o
 * código não sabe que pode criá-los, e uma capacidade que ninguém encontra
 * entrega zero.
 *
 * O grupo é DERIVADO do registro real de comandos, não escrito à mão: uma
 * lista fixa mentiria no dia em que um scaffolder fosse renomeado ou removido,
 * e mentiria em silêncio. Derivar é o que dá sentido ao segundo AC — a entrada
 * de um scaffolder ausente informa a indisponibilidade em vez de sumir (ou de
 * derrubar a lista inteira).
 */

import { describe, it, expect } from 'vitest'
import { buildAuthoringGroup, AUTHORING_SCAFFOLDERS } from '../cli/commands/authoring-group.js'

describe('buildAuthoringGroup — derived from what is actually registered', () => {
  it('lists the three scaffolders with a one-line usage each (AC1)', () => {
    const group = buildAuthoringGroup(new Set(['skill', 'agent', 'hooks']))

    expect(group.items).toHaveLength(3)
    for (const item of group.items) {
      expect(item.cmd.length, 'comando vazio').toBeGreaterThan(0)
      expect(item.desc.trim().length, `${item.cmd} sem descrição de uma linha`).toBeGreaterThan(0)
      expect(item.desc, `${item.cmd} com descrição multi-linha`).not.toContain('\n')
    }
  })

  it('names the three commands the operator actually types', () => {
    const cmds = buildAuthoringGroup(new Set(['skill', 'agent', 'hooks'])).items.map((i) => i.cmd)

    expect(cmds.some((c) => c.startsWith('skill new'))).toBe(true)
    expect(cmds.some((c) => c.startsWith('agent create'))).toBe(true)
    expect(cmds.some((c) => c.startsWith('hooks add'))).toBe(true)
  })

  it('marks a missing scaffolder as unavailable instead of dropping the rest (AC2)', () => {
    // A lista inteira sumir (ou lançar) por causa de um comando ausente seria
    // trocar uma lacuna pequena por uma cegueira total.
    const group = buildAuthoringGroup(new Set(['skill', 'hooks']))

    expect(group.items).toHaveLength(3)
    const agentEntry = group.items.find((i) => i.cmd.startsWith('agent create'))
    expect(agentEntry?.desc).toMatch(/indispon|unavailable|não instalado/i)
  })

  it('an empty registry still yields three entries, all flagged — never an empty group', () => {
    const group = buildAuthoringGroup(new Set())

    expect(group.items).toHaveLength(3)
    for (const item of group.items) {
      expect(item.desc).toMatch(/indispon|unavailable|não instalado/i)
    }
  })

  it('the declared scaffolder set is not empty — the guard cannot pass by having nothing to check', () => {
    // Sem isto, esvaziar AUTHORING_SCAFFOLDERS faria todos os testes acima
    // passarem sobre listas vazias — verde por ausência.
    expect(AUTHORING_SCAFFOLDERS.length).toBe(3)
  })
})

describe('the authoring group reaches the real help surface', () => {
  it('agf help includes an authoring group naming all three scaffolders', async () => {
    // O teste que importa para o operador: não basta a função existir, ela
    // precisa estar WIRED no índice que a pessoa realmente lê.
    const { AUTHORING_GROUP_TITLE } = await import('../cli/commands/authoring-group.js')
    const { HELP_GROUPS } = await import('../cli/commands/help-cmd.js')

    const authoring = HELP_GROUPS.find((g) => g.title === AUTHORING_GROUP_TITLE)
    expect(authoring, 'agf help não expõe o grupo de autoria').toBeDefined()

    const joined = (authoring?.items ?? []).map((i) => i.cmd).join(' ')
    expect(joined).toContain('skill new')
    expect(joined).toContain('agent create')
    expect(joined).toContain('hooks add')
  })
})
