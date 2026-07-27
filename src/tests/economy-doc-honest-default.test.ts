/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_ce9319dd46c7 — o contexto gerado afirmava um default que não existe.
 *
 * `CLAUDE.md` e `AGENTS.md` são GERADOS a partir de `cli-reference-content.ts`, e
 * o bloco de economia dizia "Default tudo OFF → comportamento byte-idêntico".
 * Isso é falso desde que o bundle loss-safe passou a ser auto-ativado quando um
 * agente-CLI dirige (node_7ee81fd6a5e0): cinco levers ligam sozinhos, e medimos
 * exatamente isso — `forage_stop`, `ncd_dedup`, `heat_kernel`, `info_bottleneck`
 * e `zipf_estimate` ativos com a config vazia.
 *
 * Um doc que mente é pior que um ausente, e este é lido por TODO agente que
 * entra no projeto — é a primeira coisa que forma o modelo mental dele.
 *
 * Corrigido na FONTE: editar `CLAUDE.md` à mão seria sobrescrito na próxima
 * regeneração.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function fonte(): string {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- caminho fixo do repo
  return readFileSync(join(process.cwd(), 'src', 'core', 'config', 'cli-reference-content.ts'), 'utf-8')
}

describe('o bloco de economia descreve o default REAL (node_ce9319dd46c7)', () => {
  it('não afirma mais que tudo fica OFF por default', () => {
    // A frase exata que mentia. Se voltar, o doc volta a mentir.
    expect(fonte()).not.toContain('Default tudo OFF → comportamento byte-idêntico')
  })

  it('menciona a auto-ativação quando um agente dirige', () => {
    const s = fonte()
    expect(s).toMatch(/auto-ativad|auto-ativação|agente.*dirige/i)
  })

  it('nomeia os levers que o bundle liga — "alguns levers" não é acionável', () => {
    // Quem lê precisa saber QUAIS, senão não consegue verificar nem desligar.
    const s = fonte()
    for (const lever of ['forage_stop', 'ncd_dedup', 'heat_kernel', 'info_bottleneck', 'zipf_estimate']) {
      expect(s, `o bloco não nomeia ${lever}`).toContain(lever)
    }
  })

  it('aponta a superfície onde o estado real é verificável', () => {
    // O doc não deve virar a fonte da verdade: ele aponta para o comando que
    // reporta o estado efetivo com a origem (`source`), entregue em node_0b96f1ced50c.
    expect(fonte()).toMatch(/source/)
  })
})
