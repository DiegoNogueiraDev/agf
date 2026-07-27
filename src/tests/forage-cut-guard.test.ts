/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_243c93c7c8a2 — o corte mais agressivo do produto não tinha rede.
 *
 * `forage_stop` está LIGADO por default sempre que um agente dirige (bundle
 * loss-safe, node_7ee81fd6a5e0) e corta 62–96% do repo-map — medido em três
 * repositórios independentes. O auto-revert (`applyLossyTransform`) existia, mas
 * só no middleware (`economy-orchestrator.ts`); o `task-prep`, onde este corte
 * acontece, não passava por ele. A única proteção era o piso `minItems: 1`, que
 * garante que sobre UM item — não que o corte preservou o que a task precisa.
 *
 * O oráculo aqui é deliberadamente MODESTO, e isso é uma decisão, não uma
 * omissão: "quebrou o sentido" para um repo-map não tem definição fechada, e um
 * oráculo esperto e errado degradaria silenciosamente toda sessão dirigida por
 * agente. O que se verifica é a relação direta e checável entre o corte e o
 * propósito do artefato — se o corte removeu TODO símbolo relacionado à task, ele
 * cortou exatamente aquilo por que o repo-map existe.
 *
 * A segurança real não vem do oráculo, e sim da REVERSIBILIDADE: o gate cacheia
 * o original (CCR) e o corte fica recuperável mesmo quando o oráculo erra.
 */

import { describe, it, expect } from 'vitest'
import { forageCutIsSafe } from '../core/autonomy/forage-cut-guard.js'

describe('forageCutIsSafe — o corte preservou o que a task procura?', () => {
  it('aceita quando o corte mantém um símbolo relacionado à task', () => {
    const full = 'src/core/economy/lever-evidence-gate.ts\nsrc/core/outra/coisa.ts'
    const cut = 'src/core/economy/lever-evidence-gate.ts'

    expect(forageCutIsSafe(full, cut, 'IMPLEMENT: gate de evidencia do lever')).toBe(true)
  })

  it('RECUSA quando o corte remove todo símbolo relacionado à task', () => {
    // O caso que a rede existe para pegar: sobrou conteúdo, mas nada que sirva.
    const full = 'src/core/economy/lever-evidence-gate.ts\nsrc/core/outra/coisa.ts'
    const cut = 'src/core/outra/coisa.ts'

    expect(forageCutIsSafe(full, cut, 'IMPLEMENT: gate de evidencia do lever')).toBe(false)
  })

  it('aceita quando o ORIGINAL já não tinha nada relacionado — o corte não piorou nada', () => {
    // Guarda contra falso positivo: se o repo-map nunca teve o termo, recusar o
    // corte não devolveria informação nenhuma, só gastaria tokens.
    const full = 'src/a.ts\nsrc/b.ts'
    const cut = 'src/a.ts'

    expect(forageCutIsSafe(full, cut, 'tema que nao aparece em lugar nenhum')).toBe(true)
  })

  it('RECUSA um corte que esvazia o mapa, mesmo sem termos em comum', () => {
    // Piso absoluto: um repo-map vazio não ajuda ninguém, qualquer que seja o foco.
    expect(forageCutIsSafe('src/a.ts\nsrc/b.ts', '', 'qualquer coisa')).toBe(false)
    expect(forageCutIsSafe('src/a.ts', '   ', 'qualquer coisa')).toBe(false)
  })

  it('ignora termos curtos do título — "de", "do", "a" casariam qualquer coisa', () => {
    // Sem isso o oráculo aprova sempre: preposições aparecem em qualquer path.
    const full = 'src/core/parser.ts\nsrc/core/lexer.ts'
    const cut = 'src/core/lexer.ts'

    // 'parser' é o termo real; foi cortado ⇒ recusa, apesar de 'de'/'do' casarem.
    expect(forageCutIsSafe(full, cut, 'ajustar o parser de expressoes')).toBe(false)
  })

  it('é case-insensitive — PascalCase no título não pode escapar do check', () => {
    const full = 'src/core/lever-evidence-gate.ts\nsrc/x.ts'
    const cut = 'src/x.ts'

    expect(forageCutIsSafe(full, cut, 'Corrigir LeverEvidence')).toBe(false)
  })
})
