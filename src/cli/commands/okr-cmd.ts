/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * `agf okr` — o cockpit de OKR (node_6334980fc7eb, épico node_fa33f02975c3).
 *
 * A SUPERFÍCIE que o dev opera: uma linha por épico com Objetivo, atingimento
 * do KR e o status derivado (on-track|at-risk|no-data). Fecha o loop que estava
 * aberto — os épicos carregavam KR e ninguém lia o outcome.
 *
 * Thin wire (DIP): colhe os épicos do grafo e as entregas do VelocityScorecard,
 * injeta o relógio e delega ao builder puro `buildOkrReport`. Nenhuma métrica é
 * recalculada aqui — o cockpit consome o que os módulos de insights já medem.
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import { buildKrMetadata } from '../../core/evals/okr-kr-source.js'
import { collectOkrRows } from '../../core/okr/okr-collect.js'

/**
 * `agf okr set <epicId>` — declara o KR de um épico.
 *
 * A metade que faltava do cockpit: `readEpicKr` lia `metadata.kr` e nada o
 * escrevia. Grava por MERGE no metadata existente (campo aberto do GraphNode,
 * zero migração) e só depois da validação — entrada inválida deixa o nó
 * exatamente como estava.
 */
function okrSetSubcommand(): Command {
  return new Command('set')
    .description('Declara o KR de um épico (target/current/unit) em metadata.kr')
    .argument('<epicId>', 'Id do épico que recebe o KR')
    .requiredOption('--target <n>', 'Valor-alvo do Key Result')
    .requiredOption('--current <n>', 'Valor atual do Key Result')
    .option('--unit <u>', 'Unidade exibida junto do número (ex.: percent, tasks)')
    .option('--deadline <iso>', 'Prazo do Key Result (ISO 8601) — sem ele o ritmo não é julgável')
    .option('-d, --dir <dir>', 'Project root directory', process.cwd())
    .action(
      (epicId: string, opts: { target: string; current: string; unit?: string; deadline?: string; dir: string }) => {
        const out = createCliOutput('okr.set')
        const built = buildKrMetadata({
          target: opts.target,
          current: opts.current,
          unit: opts.unit,
          deadline: opts.deadline,
        })
        if (!built.ok) {
          // Recusa ANTES de abrir o store: nada a desfazer, nada meio-aplicado.
          out.err(built.code, built.error)
          return
        }

        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          const node = store.getNodeById(epicId)
          if (!node) {
            out.err('NOT_FOUND', `Nó não encontrado: ${epicId}`)
            return
          }
          store.updateNode(epicId, { metadata: { ...(node.metadata ?? {}), kr: built.kr } })
          out.ok({ nodeId: epicId, kr: built.kr })
        } finally {
          store.close()
        }
      },
    )
}

/** Build the `agf okr` CLI command. */
export function okrCommand(): Command {
  return (
    new Command('okr')
      // Parent and the `set` subcommand both declare --dir. Without positional
      // options Commander binds the subcommand's flag to the parent and then
      // reports it missing — silently, pointing nowhere.
      .enablePositionalOptions()
      .description('OKR cockpit — one line per epic: objective, KR attainment and derived status')
      .option('-d, --dir <dir>', 'Project root directory', process.cwd())
      .option('--at-risk', 'Show only the objectives that need attention (status at-risk)', false)
      .addCommand(okrSetSubcommand())
      .action((opts: { dir: string; atRisk?: boolean }) => {
        const out = createCliOutput('okr')
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          out.ok(collectOkrRows(store, { now: Date.now(), atRiskOnly: opts.atRisk === true }))
        } finally {
          store.close()
        }
      })
  )
}
