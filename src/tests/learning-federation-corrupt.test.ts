/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_641d0ba84df9 (AC2) — a metade de SEGURANÇA da federação.
 *
 * A transferência de aprendizado já está provada em learning-federation-e2e:
 * um bundle de A eleva o pheromone de B e as escolhas de B mudam. Falta o
 * caso em que o bundle chega ERRADO — e aí a regra é mais forte que "não
 * importar": o projeto local **não pode piorar**. Um par que envia lixo,
 * um arquivo truncado ou um bundle de outra versão são acidentes normais numa
 * federação; se qualquer um deles conseguir rebaixar (ou envenenar) o τ local,
 * a federação passa a ser um vetor de dano em vez de um ganho, e o dano é
 * silencioso — ninguém olha o pheromone de um projeto que "só importou".
 *
 * Zero dublê: dois grafos reais em Database(':memory:'), o mesmo merge que o
 * `agf federation` percorre.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { listPheromoneTrails, mergeImportedTau } from '../core/economy/mmas-pheromone.js'
import { depositPheromone } from '../core/economy/pheromone-store.js'
import { importLearning, LEARNING_BUNDLE_VERSION } from '../core/knowledge/knowledge-packager.js'
import type { LearningBundle } from '../core/knowledge/knowledge-packager.js'

const LOCAL = 'projeto-b'
const KEY = 'trilha-que-o-projeto-ja-aprendeu'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  // O que B já sabia antes de qualquer importação. Abaixo do teto (TAU_MAX=5)
  // de propósito: ancorar o local NO teto tornaria impossível provar que um
  // bundle legítimo consegue elevá-lo, e o teste de controle passaria a medir
  // o clamp em vez da guarda.
  depositPheromone(db, LOCAL, KEY, 1)
})

function tauOf(key: string): number {
  return listPheromoneTrails(db, LOCAL).find((t) => t.key === key)?.amount ?? 0
}

function bundleWith(pheromones: LearningBundle['pheromones']): LearningBundle {
  return {
    schemaVersion: LEARNING_BUNDLE_VERSION,
    pheromones,
    episodicOutcomes: [],
    decisions: [],
  } as LearningBundle
}

describe('federation safety — a bad bundle must never make the local project worse (AC2)', () => {
  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['negativo', -10],
  ])('an amount of %s leaves the local trail untouched', (_label, amount) => {
    const before = tauOf(KEY)

    mergeImportedTau(db, LOCAL, { key: KEY, amount, ts: Date.now() })

    const after = tauOf(KEY)
    expect(Number.isFinite(after), `τ local virou ${after}`).toBe(true)
    expect(after).toBe(before)
  })

  it('a corrupted amount does not create a poisoned trail for an unknown key either', () => {
    mergeImportedTau(db, LOCAL, { key: 'chave-nova-do-par', amount: Number.NaN, ts: Date.now() })

    const created = listPheromoneTrails(db, LOCAL).find((t) => t.key === 'chave-nova-do-par')
    // Ou a trilha não existe, ou existe com um número real. O que não pode é
    // existir com NaN: uma trilha assim contamina toda soma/ordenação que a
    // leia depois, e o defeito aparece longe daqui.
    expect(created === undefined || Number.isFinite(created.amount)).toBe(true)
  })

  it('a whole bundle of garbage imports nothing and downgrades nothing', () => {
    const before = tauOf(KEY)

    const result = importLearning(db, LOCAL, bundleWith([{ key: KEY, amount: Number.NaN, ts: Date.now() }]))

    expect(result.pheromones.imported).toBe(0)
    expect(result.pheromones.skipped).toBe(1)
    expect(tauOf(KEY)).toBe(before)
  })

  it('a bundle from an incompatible version is refused with a typed, actionable error', () => {
    const stale = { ...bundleWith([]), schemaVersion: LEARNING_BUNDLE_VERSION - 1 } as LearningBundle

    // Rejeitar é o comportamento certo: um bundle de outra versão pode ter
    // outra semântica para os mesmos campos, e importar "na dúvida" é o erro.
    expect(() => importLearning(db, LOCAL, stale)).toThrowError(/version/i)
    expect(tauOf(KEY)).toBe(1)
  })

  it('a legitimate stronger bundle still raises the local trail — the guard is not just "refuse everything"', () => {
    // Sem este caso, um merge que rejeitasse TUDO passaria em todos os testes
    // acima enquanto quebrava a federação inteira.
    const raised = mergeImportedTau(db, LOCAL, { key: KEY, amount: 4, ts: Date.now() })

    expect(raised).toBe(true)
    expect(tauOf(KEY)).toBeGreaterThan(1)
  })
})
