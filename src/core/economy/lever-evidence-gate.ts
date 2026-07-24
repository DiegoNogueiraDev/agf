/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * QUEM PODE MEXER NUM DEFAULT — o filtro entre "medimos algo" e "ligue isto
 * para todo mundo" (node_b1d2aafb4b0a).
 *
 * Um lever ligado por engano custa dinheiro real de quem usa a ferramenta, e
 * custa em silêncio: ninguém abre um chamado porque a conta subiu 8%. Por isso
 * a pergunta aqui não é "houve ganho?" e sim "que número tem AUTORIDADE para
 * ligar isto sozinho?".
 *
 * ⚠️ NÃO use `economy_lever_ledger.saved` como essa autoridade. Ele grava o que
 * cada lever acha que poupou LOCALMENTE e não vê o custo que provocou do outro
 * lado. Contraprova viva no repo: `flow` soma +7.112 tokens "poupados" ali em 32
 * eventos, enquanto o A/B real mediu economia NEGATIVA (−105,5%) e uma decisão
 * registrada (node_3bd335fa3d95) o manteve OFF. É a feature corrigindo a própria
 * prova — Goodhart em uma linha de SQL.
 *
 * A autoridade é o {@link LeverVerdict} do A/B por lever (`lever-ab-harness.ts`):
 * ele roda os DOIS braços sobre o MESMO task-set, então `savedTokens` é líquido
 * e o sinal negativo sobrevive até aqui.
 *
 * Este módulo é PURO: recebe vereditos, devolve nomes. Quem os lê do disco é a
 * borda (`economyLeversSourceFromDb`), o que mantém a decisão testável sem I/O.
 */

import { LEVER_KEYS, type LeverKey } from './economy-levers-config.js'
import type { LeverVerdict } from './lever-ab-harness.js'

/**
 * Mínimo de tasks para um A/B contar como evidência.
 *
 * Abaixo disso não se distingue ganho de ruído de amostragem, e o preço do
 * falso positivo é assimétrico: ligar errado cobra de todos os usuários, deixar
 * OFF só adia um ganho. Cinco é o piso conservador — dois levers do ledger real
 * têm n=2 justamente, e nenhum deles deve ligar por causa disso.
 */
export const MIN_TASKS_FOR_EVIDENCE = 5

/**
 * Conjunto de levers conhecidos, montado SOB DEMANDA.
 *
 * Há ciclo de import legítimo aqui (config → gate → config): a config precisa
 * do gate para resolver defaults, e o gate precisa de `LEVER_KEYS` para recusar
 * lever desconhecido. Construir o Set no topo do módulo leria `LEVER_KEYS` antes
 * de a config terminar de inicializar — dependendo de quem carrega primeiro, ele
 * chegaria `undefined` e o `new Set` explodiria. Adiar até a primeira chamada
 * garante que os dois módulos já existem.
 */
let knownLevers: ReadonlySet<string> | undefined
function isKnownLever(lever: string): boolean {
  knownLevers ??= new Set(LEVER_KEYS)
  return knownLevers.has(lever)
}

/** Um número só conta se for finito — NaN/Infinity vindos de divisão vazia não. */
function isRealNumber(n: number): boolean {
  return typeof n === 'number' && Number.isFinite(n)
}

/**
 * Um veredito autoriza ligar o default?
 *
 * Exige que o campo derivado (`recommendation`) e o número bruto (`savedTokens`)
 * CONCORDEM. Divergência significa que alguém escreveu errado em algum ponto da
 * cadeia, e nesse caso a saída segura é não ligar — jamais escolher o mais
 * otimista dos dois.
 */
function provesNetGain(v: LeverVerdict): boolean {
  if (!isKnownLever(v.lever)) return false
  if (!isRealNumber(v.savedTokens) || !isRealNumber(v.taskCount)) return false
  if (v.taskCount < MIN_TASKS_FOR_EVIDENCE) return false
  // Empate não é ganho: gastar o mesmo não justifica mudar o comportamento padrão.
  if (v.savedTokens <= 0) return false
  return v.recommendation === 'enable'
}

/**
 * Os levers cuja economia líquida foi provada — os únicos que podem nascer ON.
 *
 * Lista vazia é a resposta correta e esperada quando ninguém rodou um A/B: o
 * default-OFF permanece byte-idêntico, e o gate fica inerte até existir número.
 */
export function leversWithProvenGain(verdicts: readonly LeverVerdict[]): LeverKey[] {
  return verdicts.filter(provesNetGain).map((v) => v.lever)
}
