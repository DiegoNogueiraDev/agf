/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_b1d2aafb4b0a — nenhum lever liga sem número.
 *
 * O épico quer smart-defaults: um lever cuja economia foi PROVADA deveria
 * nascer ON, em vez de esperar alguém lembrar de ligá-lo. A pergunta cara é
 * QUAL número tem autoridade para mexer num default.
 *
 * A resposta óbvia — `economy_lever_ledger.saved` — está ERRADA, e o repo tem a
 * contraprova: o lever `flow` soma 7.112 tokens "poupados" em 32 eventos desse
 * ledger, enquanto o A/B real mediu economia NEGATIVA (−105,5%) e uma decisão
 * registrada (node_3bd335fa3d95) o manteve OFF. O motivo é estrutural: aquele
 * ledger grava o que cada lever acha que poupou LOCALMENTE (o `flow` poda
 * contexto), e não enxerga o que ele custou do outro lado (puxa nós pinados).
 * É a feature corrigindo a própria prova.
 *
 * A autoridade é o `LeverVerdict` do A/B por lever: mede os DOIS braços sobre o
 * MESMO task-set, então `savedTokens` é líquido e o sinal negativo sobrevive.
 *
 * Fail-safe em tudo: sem veredito, veredito corrompido ou amostra pequena
 * demais, nada liga — o default-OFF é a rede de segurança, e ligar por engano
 * custa dinheiro real de quem usa a ferramenta.
 */

import { describe, it, expect } from 'vitest'
import { leversWithProvenGain, MIN_TASKS_FOR_EVIDENCE } from '../core/economy/lever-evidence-gate.js'
import { resolveEconomyLeversConfig, isLeverEnabled } from '../core/economy/economy-levers-config.js'
import type { LeverVerdict } from '../core/economy/lever-ab-harness.js'
import { economyLeversSourceFromDb } from '../core/economy/economy-levers-config.js'
import { recordLeverVerdict, readLeverVerdicts } from '../core/economy/lever-verdict-store.js'
import Database from 'better-sqlite3'
import type { LeverKey } from '../core/economy/economy-levers-config.js'

function verdict(over: Partial<LeverVerdict> & { lever: LeverKey }): LeverVerdict {
  return {
    tokensBefore: 1000,
    tokensAfter: 600,
    savedTokens: 400,
    costUsd: 0.01,
    taskCount: MIN_TASKS_FOR_EVIDENCE,
    recommendation: 'enable',
    ...over,
  }
}

describe('leversWithProvenGain — só o A/P líquido tem autoridade (AC1/AC2)', () => {
  it('um lever com A/B positivo e amostra suficiente é ligado (AC1)', () => {
    expect(leversWithProvenGain([verdict({ lever: 'cascade' })])).toEqual(['cascade'])
  })

  it('um lever com A/B NEGATIVO permanece OFF (AC2)', () => {
    // O caso `flow`: o disprove é resultado, e resultado contrário mantém o OFF.
    const negativo = verdict({ lever: 'flow', savedTokens: -500, recommendation: 'keep-off' })

    expect(leversWithProvenGain([negativo])).toEqual([])
  })

  it('sem veredito nenhum, nada liga — byte-idêntico ao anterior (AC2)', () => {
    expect(leversWithProvenGain([])).toEqual([])
  })

  it('amostra pequena demais não é evidência, mesmo com saldo positivo', () => {
    // Dois levers do ledger real têm n=2. Um ganho sobre 2 tasks não distingue
    // sinal de ruído, e o preço do erro é um default ligado para todo mundo.
    const raso = verdict({ lever: 'cascade', taskCount: MIN_TASKS_FOR_EVIDENCE - 1 })

    expect(leversWithProvenGain([raso])).toEqual([])
  })

  it('recommendation e savedTokens precisam CONCORDAR — discordância é fail-safe OFF (AC4)', () => {
    // Se o campo derivado e o número bruto divergem, alguém escreveu errado; a
    // saída segura é não ligar, nunca escolher o mais otimista dos dois.
    const inconsistente = verdict({ lever: 'cascade', savedTokens: -1, recommendation: 'enable' })

    expect(leversWithProvenGain([inconsistente])).toEqual([])
  })
})

describe('veredito corrompido ou absurdo nunca liga um default (AC4)', () => {
  it.each([
    ['savedTokens NaN', { savedTokens: Number.NaN }],
    ['savedTokens infinito', { savedTokens: Number.POSITIVE_INFINITY }],
    ['taskCount negativo', { taskCount: -5 }],
    ['saldo zero — empate não é ganho', { savedTokens: 0, recommendation: 'keep-off' as const }],
  ])('%s → OFF', (_label, over) => {
    expect(leversWithProvenGain([verdict({ lever: 'cascade', ...over })])).toEqual([])
  })

  it('um lever desconhecido no veredito é ignorado, não propagado para a config', () => {
    // Veredito vindo de uma versão mais nova (lever renomeado/removido) não pode
    // injetar chave estranha no config — o schema aceitaria e ninguém leria.
    const estranho = verdict({ lever: 'lever_que_nao_existe' as LeverKey })

    expect(leversWithProvenGain([estranho])).toEqual([])
  })

  it('mantém apenas os provados quando a lista mistura os dois casos', () => {
    const misto = [
      verdict({ lever: 'cascade' }),
      verdict({ lever: 'flow', savedTokens: -900, recommendation: 'keep-off' }),
    ]

    expect(leversWithProvenGain(misto)).toEqual(['cascade'])
  })
})

describe('a porta é OPCIONAL — quem não a implementa fica byte-idêntico (AC2)', () => {
  it('uma fonte sem getProvenLevers resolve exatamente como antes', () => {
    const cfg = resolveEconomyLeversConfig({ getProjectSetting: () => undefined })

    expect(cfg).toEqual({})
  })

  it('uma fonte COM evidência nasce com o lever provado ligado (AC1)', () => {
    const cfg = resolveEconomyLeversConfig({
      getProjectSetting: () => undefined,
      getProvenLevers: () => ['cascade'],
    })

    expect(isLeverEnabled(cfg, 'cascade')).toBe(true)
  })

  it('a evidência NÃO desliga o que o usuário ligou à mão', () => {
    // Autonomia do operador: o gate só ACRESCENTA. Desligar por evidência seria
    // o sistema revogando uma escolha explícita de quem opera.
    const cfg = resolveEconomyLeversConfig({
      getProjectSetting: () => JSON.stringify({ flow: { enabled: true } }),
      getProvenLevers: () => [],
    })

    expect(isLeverEnabled(cfg, 'flow')).toBe(true)
  })

  it('a evidência não sobrescreve params que o usuário ajustou', () => {
    const cfg = resolveEconomyLeversConfig({
      getProjectSetting: () => JSON.stringify({ cascade: { enabled: false, params: { threshold: 7 } } }),
      getProvenLevers: () => ['cascade'],
    })

    expect(cfg.cascade?.enabled).toBe(true)
    expect(cfg.cascade?.params?.threshold, 'o gate comeu o ajuste do operador').toBe(7)
  })

  it('uma porta que EXPLODE não derruba a resolução — hot path', () => {
    // resolve roda em caminho quente (3 call-sites no orquestrador). Uma leitura
    // de DB que falha não pode virar exceção lá dentro.
    const cfg = resolveEconomyLeversConfig({
      getProjectSetting: () => undefined,
      getProvenLevers: () => {
        throw new Error('db offline')
      },
    })

    expect(cfg).toEqual({})
  })
})

describe('o veredito PERSISTE — sem isso o gate é um leitor sem produtor', () => {
  it('grava um veredito e o lê de volta como evidência (AC1 ponta a ponta)', () => {
    const db = new Database(':memory:')
    recordLeverVerdict(db, { lever: 'cascade', savedTokens: 400, taskCount: 9, recommendation: 'enable' })

    expect(leversWithProvenGain(readLeverVerdicts(db))).toEqual(['cascade'])
  })

  it('o veredito mais RECENTE por lever vence — reexecutar um A/B corrige o default', () => {
    // Sem isto, um A/B antigo e favorável manteria o lever ligado para sempre,
    // mesmo depois de uma medição nova mostrar que ele passou a custar.
    const db = new Database(':memory:')
    recordLeverVerdict(db, { lever: 'cascade', savedTokens: 400, taskCount: 9, recommendation: 'enable' })
    recordLeverVerdict(db, { lever: 'cascade', savedTokens: -80, taskCount: 9, recommendation: 'keep-off' })

    expect(leversWithProvenGain(readLeverVerdicts(db))).toEqual([])
  })

  it('a tabela se auto-cura — ler antes de qualquer escrita não explode', () => {
    // Migração registrada sem tabela física já quebrou este repo antes; ler tem
    // de devolver "sem evidência", nunca derrubar o caminho quente.
    expect(readLeverVerdicts(new Database(':memory:'))).toEqual([])
  })

  it('a fonte-DB implementa a porta e entrega o lever provado (AC1 no consumidor)', () => {
    const db = new Database(':memory:')
    db.exec('CREATE TABLE project_settings (key TEXT PRIMARY KEY, value TEXT)')
    recordLeverVerdict(db, { lever: 'cascade', savedTokens: 400, taskCount: 9, recommendation: 'enable' })

    const cfg = resolveEconomyLeversConfig(economyLeversSourceFromDb(db))

    expect(isLeverEnabled(cfg, 'cascade'), 'a fonte real não entregou a evidência').toBe(true)
  })

  it('sem A/B nenhum, a fonte real resolve tudo OFF — o estado de hoje (AC2)', () => {
    const db = new Database(':memory:')
    db.exec('CREATE TABLE project_settings (key TEXT PRIMARY KEY, value TEXT)')

    expect(resolveEconomyLeversConfig(economyLeversSourceFromDb(db))).toEqual({})
  })
})
