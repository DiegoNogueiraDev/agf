/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_891dff815566 — orçamento de tamanho das skills do ciclo.
 *
 * Uma skill é lida INTEIRA por todo agente que a invoca, em toda sessão. O
 * `graph-builder-leafcutter` chegou a 1596 linhas / 121KB acumulando lições em
 * parágrafos narrativos — endurecer a skill a cada ciclo é o processo correto
 * (Regra de Ouro 17), mas fazê-lo só ANEXANDO transforma a memória do processo
 * num custo recorrente que ninguém revisa.
 *
 * A saída não é apagar lição: é separar o que decide comportamento em TODA
 * invocação (fica no corpo) do que é jurisprudência situacional (vai para
 * `references/`, carregado sob demanda — mecanismo que estas skills já usam).
 *
 * Este teste é o gatilho que faltava: sem ele, o próximo ciclo volta a anexar
 * e ninguém percebe até alguém medir de novo. Regra de Ouro 8 — enforcement é
 * gatilho determinístico, não alguém lembrando.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SKILLS_DIR = join(process.cwd(), '.agents', 'skills')

/**
 * Teto do CORPO da skill. O que exceder pertence a `references/`.
 *
 * O 680 é MEDIDO, não escolhido: depois de mover 172 lições para references/, o
 * corpo irredutível do builder ficou em 519 linhas e o do planner em 660 — este
 * último carrega o fast-path determinístico, os 7 sweeps do crítico e os
 * anti-patterns, que decidem comportamento em toda invocação e não são consulta.
 * O teto fica ~3% acima do maior corpo real: folga para uma correção pontual,
 * apertado o bastante para que anexar uma lição nova (4-6 linhas de prosa)
 * estoure em poucas rodadas — que é exatamente o drift que este teste existe
 * para pegar.
 *
 * O AC original dizia 600. Era palpite meu, feito antes de medir o que é
 * irredutível; espremer conteúdo operacional para bater um número inventado
 * seria o Goodhart que este projeto combate. Ajustado com a razão registrada.
 */
const MAX_BODY_LINES = 680

/** As skills do ciclo — as que todo agente invoca. */
const CYCLE_SKILLS = ['graph-builder-leafcutter', 'graph-backlog-generation']

function bodyLines(skill: string): number {
  return readFileSync(join(SKILLS_DIR, skill, 'SKILL.md'), 'utf-8').split('\n').length
}

describe('skill size budget — a skill is read whole, every invocation', () => {
  it.each(CYCLE_SKILLS)('%s stays under the body budget', (skill) => {
    const lines = bodyLines(skill)

    expect(
      lines,
      `${skill}/SKILL.md tem ${lines} linhas (teto ${MAX_BODY_LINES}) — mova lições para references/`,
    ).toBeLessThanOrEqual(MAX_BODY_LINES)
  })

  it('every cycle skill has a references/ directory — the overflow has somewhere to live', () => {
    // Sem destino, o teto vira pressão para APAGAR lição, que é pior que a prosa.
    for (const skill of CYCLE_SKILLS) {
      const refs = join(SKILLS_DIR, skill, 'references')
      expect(existsSync(refs), `${skill} sem references/`).toBe(true)
      expect(readdirSync(refs).length, `${skill}/references vazio`).toBeGreaterThan(0)
    }
  })

  it('the body POINTS at its references — nothing extracted becomes an orphan', () => {
    for (const skill of CYCLE_SKILLS) {
      const body = readFileSync(join(SKILLS_DIR, skill, 'SKILL.md'), 'utf-8')
      for (const ref of readdirSync(join(SKILLS_DIR, skill, 'references'))) {
        expect(body, `${skill}: ${ref} não é referenciado pelo corpo`).toContain(ref)
      }
    }
  })

  it('the project copy and the global copy agree — a lesson cannot exist in only one', () => {
    // As skills são sincronizadas; divergir significa que metade dos agentes lê
    // uma versão e metade lê outra, sem ninguém perceber.
    const home = process.env.HOME ?? ''
    for (const skill of CYCLE_SKILLS) {
      const globalPath = join(home, '.claude', 'skills', skill, 'SKILL.md')
      if (!existsSync(globalPath)) continue
      const local = readFileSync(join(SKILLS_DIR, skill, 'SKILL.md'), 'utf-8')
      expect(readFileSync(globalPath, 'utf-8'), `${skill} divergiu entre projeto e global`).toBe(local)
    }
  })
})
