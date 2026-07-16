/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * `agf ant` — provisão de worktree-por-formiga (node_d95f65a50dbf, épico
 * node_5581f7a45f3a).
 *
 * WHY: em árvore compartilhada o paralelismo útil da colônia satura em ~3-5
 * formigas (done-gate lê a árvore inteira; git index/push sem coordenação;
 * blast enxerga sujeira alheia). `ant spawn` dá a cada formiga um git worktree
 * próprio (branch `ant/<id>` a partir do HEAD) e devolve os exports prontos —
 * `AGF_AGENT_ID` (identidade) + `AGF_GRAPH_ROOT` (grafo/memórias CENTRAIS via
 * resolve-store-root.ts) — isolamento de arquivos com estigmergia intacta.
 *
 * CONTRATO: envelope JSON padrão; spawn é idempotente (worktree vivo é
 * reusado); `rm` remove o worktree e PRESERVA a branch (o trabalho não some);
 * ids são validados contra path traversal. Merge p/ main continua manual
 * (golden rule: branch finalizada na mesma sessão).
 */

import { existsSync, lstatSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { Command } from 'commander'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import {
  isSafeAntId,
  gitIn,
  resolveRepoRoot,
  antsDirFor,
  listAntWorktrees,
  provisionAntWorktree,
  AntProvisionError,
} from '../../core/swarm/worktree-provision.js'

const log = createLogger({ layer: 'cli', source: 'ant-cmd.ts' })

/** Builds the `agf ant` CLI command (Commander definition). */
export function antCommand(): Command {
  log.info('ant command registered')
  const cmd = new Command('ant').description(
    'Worktree-por-formiga: spawn|list|rm — cada formiga num worktree próprio, todas no MESMO grafo (AGF_GRAPH_ROOT)',
  )

  cmd
    .command('spawn')
    .description(
      'Spawnar formiga: cria (ou reusa) o worktree da formiga em <repo>-ants/<id> e devolve os exports prontos',
    )
    .argument('<id>', 'Identidade da formiga (ex.: formiga-a)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((id: string, opts: { dir: string }) => {
      const out = createCliOutput('ant.spawn')
      const repoRoot = resolveRepoRoot(opts.dir)
      if (!repoRoot) {
        out.err('NOT_A_GIT_REPO', `Sem repositório git em ${opts.dir} — o worktree da formiga precisa de um repo`)
        return
      }
      try {
        // Reusa a fonte única de provisionamento (core/swarm/worktree-provision) —
        // a MESMA que `ant-swarming spawn` usa. Valida id + idempotência lá dentro.
        const wt = provisionAntWorktree(repoRoot, id)
        out.ok({
          ...wt,
          exports: { AGF_AGENT_ID: id, AGF_GRAPH_ROOT: repoRoot },
          hint: `cd ${wt.path} && export AGF_AGENT_ID=${id} AGF_GRAPH_ROOT=${repoRoot}`,
        })
      } catch (err) {
        if (err instanceof AntProvisionError) out.err(err.code, err.message)
        else out.err('WORKTREE_FAILED', err instanceof Error ? err.message : String(err))
      }
    })

  cmd
    .command('list')
    .description('Lista os worktrees de formiga vivos da colônia')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('ant.list')
      const repoRoot = resolveRepoRoot(opts.dir)
      if (!repoRoot) {
        out.err('NOT_A_GIT_REPO', `Sem repositório git em ${opts.dir}`)
        return
      }
      const ants = listAntWorktrees(repoRoot)
      out.ok({ ants, count: ants.length })
    })

  cmd
    .command('rm')
    .description('Remove o worktree da formiga (a branch ant/<id> é preservada)')
    .argument('<id>', 'Identidade da formiga')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--force', 'Remove mesmo com mudanças não-commitadas no worktree', false)
    .action((id: string, opts: { dir: string; force: boolean }) => {
      const out = createCliOutput('ant.rm')
      if (!isSafeAntId(id)) {
        out.err('INVALID_ANT_ID', `Id de formiga inválido: "${id}"`)
        return
      }
      const repoRoot = resolveRepoRoot(opts.dir)
      if (!repoRoot) {
        out.err('NOT_A_GIT_REPO', `Sem repositório git em ${opts.dir}`)
        return
      }
      const wtPath = join(antsDirFor(repoRoot), id)
      if (!existsSync(wtPath)) {
        out.err('NOT_FOUND', `Worktree não encontrado: ${wtPath}`)
        return
      }
      try {
        // O symlink de node_modules é NOSSO (criado pelo spawn) — desfazê-lo
        // antes evita que o git recuse o remove por "untracked content".
        const linked = join(wtPath, 'node_modules')
        if (existsSync(linked) && lstatSync(linked).isSymbolicLink()) unlinkSync(linked)
        const args = ['worktree', 'remove', wtPath]
        if (opts.force) args.push('--force')
        gitIn(repoRoot, ...args)
        out.ok({ id, path: wtPath, removed: true, branchKept: `ant/${id}` })
      } catch (err) {
        out.err(
          'WORKTREE_DIRTY',
          `git worktree remove recusou (mudanças não-commitadas?): ${err instanceof Error ? err.message : String(err)} — commite na formiga ou use --force`,
        )
      }
    })

  return cmd
}
