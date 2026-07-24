/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * agf commit-scope <id> (node_fd2cc3209ef6) — commit por PATHSPEC dos arquivos
 * declarados do node (implementationFiles + testFiles), imune ao index global.
 *
 * WHY: num working tree compartilhado entre formigas, `git commit` sem pathspec
 * engole qualquer staged alheio (vivido 2× em sessão real: um style-commit levou
 * os arquivos de outra entrega junto). O pathspec (`git commit -m msg -- <paths>`)
 * commita SÓ o escopo declarado e deixa o staged alheio intacto no index.
 *
 * Contrato: envelope {ok,data,meta}; NO_DECLARED_FILES quando o node não declara
 * nada; falha nomeando o path quando um declarado não existe no disco (mesma
 * triangulação física do gate PHANTOM_TESTFILE do done). Nunca cria commit em
 * caso de falha. Compõe com done-cmd.ts (fecha o node) — a sequência da colônia
 * é: agf done <id> → agf commit-scope <id> -m "<msg>".
 */

import { Command } from 'commander'
import { execFileSync } from 'node:child_process'
import { openStoreOrFail } from '../open-store.js'
import { missingFiles } from '../../core/gaps/detect-phantom-done.js'
import { makeFileExists } from '../shared/file-exists-port.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'commit-scope-cmd.ts' })

function git(dir: string, args: string[]): string {
  // Opera SEMPRE no repo de opts.dir: GIT_DIR/GIT_INDEX_FILE herdados de um
  // hook git em andamento no caller redirecionariam o commit pro repo errado.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))
  // git commit dispara a cadeia de hooks do repo (audit + lint-staged + blast
  // podem passar de 1 min) — timeout curto derrubava o commit no meio (medido
  // em dogfood: ETIMEDOUT aos 10s). 5 min cobre hooks pesados; add/rev-parse
  // são rápidos e o teto alto não os afeta.
  return execFileSync('git', args, { cwd: dir, encoding: 'utf-8', timeout: 300_000, env }).trim()
}

/** Builds the `agf commit-scope` CLI command (Commander definition). */
export function commitScopeCommand(): Command {
  log.info('commit-scope command registered')
  return new Command('commit-scope')
    .description(
      'Commita EXATAMENTE os arquivos declarados do node (pathspec) — staged alheio no index permanece intacto',
    )
    .argument('<id>', 'ID do node cujo escopo declarado será commitado')
    .requiredOption('-m, --message <msg>', 'Mensagem do commit')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((id: string, opts: { message: string; dir: string }) => {
      const out = createCliOutput('commit-scope')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const node = store.getNodeById(id)
        if (!node) {
          out.err('NOT_FOUND', `Nó não encontrado: ${id}`)
          return
        }

        const declared = [...new Set([...(node.implementationFiles ?? []), ...(node.testFiles ?? [])])]
        if (declared.length === 0) {
          out.fail(
            'NO_DECLARED_FILES',
            `Nó "${id}" não declara implementationFiles nem testFiles — declare via agf node update ${id} --implementation-files … --test-files … antes de commitar por escopo.`,
            { taskId: id },
          )
          return
        }

        const phantom = missingFiles(declared, makeFileExists(opts.dir))
        if (phantom.length > 0) {
          out.fail(
            'PHANTOM_FILE',
            `Arquivo(s) declarado(s) não existem no disco: ${phantom.join(', ')} — corrija a declaração ou crie o arquivo antes de commitar.`,
            { taskId: id, phantomFiles: phantom },
          )
          return
        }

        // Stage apenas o escopo (novos arquivos precisam de add p/ o pathspec
        // commit enxergá-los) e commita por pathspec — o resto do index fica
        // exatamente como estava.
        git(opts.dir, ['add', '--', ...declared])
        git(opts.dir, ['commit', '-m', opts.message, '--', ...declared])
        const sha = git(opts.dir, ['rev-parse', 'HEAD'])

        log.info('commit-scope:done', { taskId: id, files: declared.length, sha })
        out.ok({ taskId: id, commit: sha, files: declared })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        out.fail('GIT_FAILED', `git falhou no commit por escopo: ${message}`, { taskId: id })
      } finally {
        store.close()
      }
    })
}
