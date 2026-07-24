/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_2872d221f92d — a deny-list de ruído podava por NOME, em qualquer
 * profundidade, e comia campo legítimo.
 *
 * `tasks` entrou na lista para cortar o detalhe financeiro por task do
 * relatório de economia — uma estrutura pesada. Mas a poda é por chave, então
 * o escalar `tasks: 4` do envelope de `agf swarm bench` sumia junto, e um
 * speedup sem saber sobre quantas tasks foi medido é ilegível.
 *
 * A distinção que este arquivo fixa: a lista existe para cortar VOLUME, e um
 * escalar não é volume. Chaves cujo motivo é "detalhe pesado" passam a podar
 * só coleções; as que existem por outro motivo (segredo, config verbosa)
 * continuam podando sempre — e o teste exige que cada uma esteja num dos dois
 * grupos, para que a próxima chave genérica não entre sem alguém decidir qual.
 */

import { describe, it, expect } from 'vitest'
import { aiCompress } from '../core/output/ai-compress.js'
import { BULK_ONLY_NOISE_KEYS, ALWAYS_NOISE_KEYS } from '../core/output/ai-compress.js'

function envelope(command: string, data: unknown): Record<string, unknown> {
  return { ok: true, data, meta: { command } }
}

function dataOf(env: Record<string, unknown>): Record<string, unknown> {
  return (env.data ?? {}) as Record<string, unknown>
}

describe('noise stripping — bulk is noise, a fact is not (AC1)', () => {
  it('keeps a scalar `tasks` in a command that has nothing to do with economy', () => {
    const out = aiCompress(envelope('swarm.bench', { k: 4, tasks: 4, speedup: 3.9 }))

    expect(dataOf(out).tasks, 'o escalar foi podado como se fosse volume').toBe(4)
  })

  it('still strips a heavy per-task breakdown — the reason the key was listed (AC2)', () => {
    const heavy = {
      tasks: [
        { id: 'a', cost: 1 },
        { id: 'b', cost: 2 },
      ],
      total: 3,
    }

    const out = aiCompress(envelope('metrics', heavy))

    expect(dataOf(out).tasks, 'o detalhe pesado voltou — regressão de token').toBeUndefined()
    expect(dataOf(out).total).toBe(3)
  })

  it('strips a heavy object too, not only arrays', () => {
    const out = aiCompress(envelope('metrics', { tasks: { a: 1, b: 2 }, total: 3 }))

    expect(dataOf(out).tasks).toBeUndefined()
  })

  it('keeps a scalar nested deep — the poda era em qualquer profundidade', () => {
    const out = aiCompress(envelope('swarm.bench', { run: { detail: { tasks: 8 } } }))

    const run = dataOf(out).run as Record<string, unknown>
    const detail = run.detail as Record<string, unknown>
    expect(detail.tasks).toBe(8)
  })
})

describe('every generic key is deliberately classified (AC3)', () => {
  it('no key sits in both groups — the classification is a decision, not an accident', () => {
    const both = [...BULK_ONLY_NOISE_KEYS].filter((k) => ALWAYS_NOISE_KEYS.has(k))

    expect(both, `chaves em ambos os grupos: ${both.join(', ')}`).toEqual([])
  })

  it('the bulk-only group is not empty — otherwise the fix silently reverts', () => {
    // Sem esta guarda, esvaziar BULK_ONLY_NOISE_KEYS faria os testes acima
    // passarem por outro caminho e a poda voltaria a comer escalares.
    expect(BULK_ONLY_NOISE_KEYS.size).toBeGreaterThan(0)
  })

  it('the collection-shaped names are bulk-only, not always-strip', () => {
    // Os nomes genéricos que descrevem coleções são exatamente os que podem
    // colidir com um escalar legítimo em outro comando.
    for (const key of ['tasks', 'commands', 'levers']) {
      expect(BULK_ONLY_NOISE_KEYS.has(key), `${key} deveria podar só quando é coleção`).toBe(true)
    }
  })
})
