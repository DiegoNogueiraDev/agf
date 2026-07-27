/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_204a6111227e — o A/B rodava sobre um prompt de brinquedo.
 *
 * O executor ao vivo (node_583654b9f480) acendeu a medição, mas o CLI montava o
 * corpo como `"Task <id>: responda OK."`. Medido: tokensBefore = tokensAfter =
 * 127 para `cascade` E `ncd_dedup`, savedTokens 0, `keep-off` nos dois. Não há o
 * que um lever corte em 20 tokens — então TODO veredito saía negativo por
 * construção, e o aparato ficava vivo e não-informativo.
 *
 * Um A/B cujo resultado é constante não mede nada; só parece medir. A correção é
 * dar ao braço o payload que o consumidor real carrega — o context-pack da task.
 */

import { describe, it, expect } from 'vitest'
import { buildLeverAbBody, MIN_REALISTIC_BODY_CHARS } from '../core/economy/lever-ab-body.js'

const contexto = {
  task: { id: 'node_x', title: 'Implementa o gate', acceptanceCriteria: ['Given A, When B, Then C'] },
  related: Array.from({ length: 12 }, (_, i) => ({ id: `node_${i}`, title: `vizinho ${i}`, status: 'done' })),
}

describe('buildLeverAbBody — o braço recebe o payload do consumidor real', () => {
  it('carrega o context-pack numa mensagem role:tool — onde os levers agem', () => {
    // O middleware de economia comprime mensagens `role:'tool'`. Um corpo que
    // não tem nenhuma passa intacto pelos dois braços por construção.
    const body = buildLeverAbBody('node_x', contexto)

    expect(body.messages.some((m) => m.role === 'tool')).toBe(true)
  })

  it('o payload é grande o bastante para um lever ter o que cortar', () => {
    const body = buildLeverAbBody('node_x', contexto)
    const total = body.messages.map((m) => String(m.content ?? '')).join('').length

    expect(total).toBeGreaterThan(MIN_REALISTIC_BODY_CHARS)
  })

  it('é REPRODUTÍVEL — o mesmo contexto gera o mesmo corpo (AC3)', () => {
    // Sem isto, dois braços do mesmo A/B poderiam diferir por ordenação de
    // chaves e o delta mediria o serializador, não o lever.
    const a = JSON.stringify(buildLeverAbBody('node_x', contexto))
    const b = JSON.stringify(buildLeverAbBody('node_x', contexto))

    expect(a).toBe(b)
  })

  it('sem context-pack, degrada para um corpo mínimo identificando a task', () => {
    // Contexto ausente é possível (node recém-criado). Melhor um corpo pequeno e
    // honesto do que estourar o A/B inteiro.
    const body = buildLeverAbBody('node_x', null)

    expect(body.messages.length).toBeGreaterThan(0)
    expect(JSON.stringify(body)).toContain('node_x')
  })

  it('o corpo mínimo é DECLARADAMENTE insuficiente — quem lê sabe que o veredito não vale', () => {
    // A armadilha que este arquivo existe para fechar: um corpo pequeno produz
    // savedTokens 0 e "keep-off", que é indistinguível de "o lever não serve".
    // O chamador precisa poder separar os dois casos.
    const body = buildLeverAbBody('node_x', null)
    const total = body.messages.map((m) => String(m.content ?? '')).join('').length

    expect(total).toBeLessThan(MIN_REALISTIC_BODY_CHARS)
  })
})
