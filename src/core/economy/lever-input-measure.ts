/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * MEDIR UM CORTADOR DE ENTRADA — de graça, sem provider (node_28c3420006fc).
 *
 * Cinco levers (`heat_kernel`, `ncd_dedup`, `forage_stop`, `info_bottleneck`,
 * `zipf_estimate`) agem sobre o payload que {@link prepareTask} monta. O efeito
 * deles é no TAMANHO DA ENTRADA — e entrada é observável ANTES de qualquer
 * chamada. Medir isso pelo provider gastaria dinheiro real e importaria a
 * variância do modelo para observar um corte que já está visível de graça.
 *
 * **Complementar, não substituto.** O A/B por provider
 * (`lever-ab-harness.ts`) continua sendo o instrumento certo para levers que
 * mudam a SAÍDA — `cascade` troca de modelo, e o custo disso só aparece na
 * fatura. Cada lever merece o instrumento do seu tipo de efeito; foi medir
 * cortador-de-entrada pelo seam errado que produziu uma bateria de zeros
 * indistinguíveis de "o lever não serve".
 *
 * ─── Por que dá para atribuir o resultado a UM lever ─────────────────────────
 *
 * `resolveEffectiveLevers` liga o bundle loss-safe inteiro quando um agente
 * dirige (decisão deliberada — node_7ee81fd6a5e0). Sem neutralizar isso, os dois
 * braços recebem os 5 ligados e a medição dá zero por CONFUNDIMENTO. Aqui os
 * braços usam o `leversOverride` (node_aba7185d8d98): OFF = `{}` (nada, nem o
 * bundle), ON = só o lever em teste. É o que torna o número atribuível.
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import { prepareTask, type TaskPreparation } from '../autonomy/task-prep.js'
import type { LeverKey } from './economy-levers-config.js'
import { McpGraphError } from '../utils/errors.js'

/** Falha da medição de lever de entrada — tipada para o chamador distinguir a causa. */
export class InputLeverMeasureError extends McpGraphError {
  constructor(
    readonly code: 'NODE_NOT_FOUND',
    message: string,
  ) {
    super(message)
    this.name = 'InputLeverMeasureError'
  }
}

/** Resultado da medição de UM lever de entrada sobre UMA task. */
export interface InputLeverMeasurement {
  lever: LeverKey
  /** Tamanho do payload com o lever DESLIGADO (baseline limpo, sem bundle). */
  before: number
  /** Tamanho do payload com APENAS este lever ligado. */
  after: number
  /**
   * `before − after`. Positivo = cortou; **negativo = INFLOU**.
   *
   * O sinal precisa sobreviver: um lever que infla a entrada é um achado tão
   * válido quanto um que corta, e já aconteceu neste projeto (o `flow` inflou
   * ~105%). Colapsar em zero esconderia justamente o caso mais importante.
   */
  saved: number
}

/**
 * Tamanho do payload que a preparação entrega ao modelo.
 *
 * Soma as partes que os levers moldam. Medir em CARACTERES e não em tokens é
 * deliberado: tokenizar traria o estimador (`zipf_estimate`) para dentro da
 * régua, e uma régua que muda junto com o que ela mede não serve para comparar
 * braços.
 */
function payloadSize(prep: TaskPreparation): number {
  return (
    (prep.repoMap?.length ?? 0) +
    (prep.flowContext?.length ?? 0) +
    prep.pheromoneTrails.join('').length +
    prep.priorMemories.reduce((acc, m) => acc + JSON.stringify(m).length, 0)
  )
}

/**
 * Mede o corte de entrada de UM lever sobre UMA task.
 *
 * `saved === 0` é RESULTADO, não erro — significa que o lever não muda a entrada
 * daquela task. Tratar isso como falha do instrumento já custou um ciclo neste
 * projeto; quem consome deve ler zero como "não entregou aqui", que é uma
 * informação legítima e acionável.
 */
export async function measureInputLever(
  store: SqliteStore,
  nodeId: string,
  lever: LeverKey,
  opts: { projectDir?: string } = {},
): Promise<InputLeverMeasurement> {
  const node = store.getNodeById(nodeId)
  if (!node) {
    throw new InputLeverMeasureError(
      'NODE_NOT_FOUND',
      `measureInputLever: node ${nodeId} não existe — sem task não há entrada para medir`,
    )
  }
  const ref = { id: node.id, title: node.title, description: node.description ?? '' }

  // Braço OFF: `{}` explícito, não "config do projeto" — o baseline precisa
  // estar limpo do bundle auto-ativado, senão os dois braços já vêm ligados.
  // `projectDir` é o que HABILITA o memory-inject (`task-prep.ts`: o ramo inteiro
  // vive atrás de `if (opts.projectDir)`). Sem ele, `priorMemories` é sempre 0 e
  // os levers que agem sobre memórias — `ncd_dedup` exige >1, `memory_salience`
  // ranqueia — ficam ESTRUTURALMENTE impedidos. O zero deles seria artefato do
  // instrumento, não veredito sobre o lever: a distinção entre "não entregou" e
  // "não foi exercitado", que é a que decide se alguém remove a capacidade.
  const dir = opts.projectDir ? { projectDir: opts.projectDir } : {}
  const off = await prepareTask(store, ref, { leversOverride: {}, ...dir })
  const on = await prepareTask(store, ref, { leversOverride: { [lever]: { enabled: true } }, ...dir })

  const before = payloadSize(off)
  const after = payloadSize(on)
  return { lever, before, after, saved: before - after }
}
